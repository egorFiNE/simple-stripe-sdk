import { DEFAULT_BASE_URL, DEFAULT_MAX_RETRIES, DEFAULT_TIMEOUT_MS, RETRY_BASE_DELAY_MS, USER_AGENT } from "./constants.js";
import formurlencoded, { type formUrlEncoded } from "./form-urlencoded.mjs";
import { computeRetryDelayMs, isAbortError, isStripeErrorPayload, jsonParseWithCatch, shouldRetryError, shouldRetryResponse, sleepMs } from "./utils.js";
import type {
  SimpleStripeFailure,
  SimpleStripeListResult,
  SimpleStripeRequestListOptions,
  SimpleStripeRequestOptions,
  SimpleStripeRequestSearchOptions,
  SimpleStripeResult,
  SimpleStripeSearchResult
} from "./types.js";

const properFormUrlEncodedOptions: formUrlEncoded.FormEncodedOptions = {
  sorted: false,
  skipIndex: false,
  ignorenull: false,
  ignoreEmptyArray: false,
  skipBracket: false,
  useDot: false,
  whitespace: "%20"
};

type PreparedRequest = {
  url: URL;
  method: string;
  headers: Headers;
  body?: any;
};

type ExecutedAttemptOutcome<T> = {
  shouldReturn: boolean;
  delayMs: number;
  result: SimpleStripeResult<T>;
};

type StripeListPayload<T> = {
  data: T[];
  has_more?: boolean;
};

type StripeSearchPayload<T> = StripeListPayload<T> & {
  next_page?: string;
  total_count?: number;
};

type StripeEntityWithId = {
  id: string;
};

export class SimpleStripeClient {
  public timeoutMs = DEFAULT_TIMEOUT_MS;
  public baseUrl = DEFAULT_BASE_URL;
  public readonly headers = new Headers();
  public maxRetries = DEFAULT_MAX_RETRIES;

  public constructor(public readonly apiKey: string, public readonly apiVersion?: string) {
    this.headers.set("Authorization", "Bearer " + this.apiKey);
    this.headers.set("Accept", "application/json");
    this.headers.set("User-Agent", USER_AGENT);

    if (this.apiVersion) {
      this.headers.set("Stripe-Version", this.apiVersion);
    }
  }

  public async get<T>(path: string, options: SimpleStripeRequestOptions = {}): Promise<SimpleStripeResult<T>> {
    return this.request<T>("GET", path, options);
  }

  public async post<T>(path: string, options: SimpleStripeRequestOptions = {}): Promise<SimpleStripeResult<T>> {
    return this.request<T>("POST", path, options);
  }

  public async patch<T>(path: string, options: SimpleStripeRequestOptions = {}): Promise<SimpleStripeResult<T>> {
    return this.request<T>("PATCH", path, options);
  }

  public async delete<T>(path: string, options: SimpleStripeRequestOptions = {}): Promise<SimpleStripeResult<T>> {
    return this.request<T>("DELETE", path, options);
  }

  public async list<T>(path: string, options: SimpleStripeRequestListOptions = {}): Promise<SimpleStripeListResult<T>> {
    // FIXME extract this validation logic
    if (options.limit !== undefined && (!Number.isInteger(options.limit) || options.limit < 0)) {
      return {
        ok: false,
        error: {
          kind: "validation",
          message: "List limit must be a non-negative integer."
        }
      };
    }

    if (options.limit === 0) {
      return {
        ok: true,
        data: [],
        hasMore: false
      };
    }

    const requestedLimit = options.limit ?? Number.POSITIVE_INFINITY;
    const collected: T[] = [];
    const batchSize = Math.min(100, requestedLimit);

    let cursor = options.afterId;

    while (true) {
      const params: Record<string, unknown> = {
        ...options.params,
        limit: batchSize
      };

      if (cursor) {
        params.starting_after = cursor;
      }

      // Stripe might return a single entry instead of a list because we don't know what path has been supplied to us here.
      const result = await this.request<StripeListPayload<T> | T>("GET", path, {
        ...options,
        params
      });

      if (!result.ok) {
        return result;
      }

      if (!isStripeListPayload(result.data)) {
        return {
          ok: true,
          data: [ result.data ],
          hasMore: false
        };
      }

      collected.push(...result.data.data);

      const hasReachedLimit = collected.length >= requestedLimit;
      const shouldContinue = !hasReachedLimit && !!result.data.has_more && result.data.data.length > 0;

      if (shouldContinue) {
        cursor = (result.data.data.at(-1) as StripeEntityWithId).id;
        continue;
      }

      const data = collected.slice(0, requestedLimit);

      if (hasReachedLimit && result.data.has_more) {
        const lastItem = data.at(-1) as StripeEntityWithId;

        return {
          ok: true,
          data,
          hasMore: true,
          lastId: lastItem.id
        };
      }

      return {
        ok: true,
        data,
        hasMore: false
      };
    }
  }

  public async search<T>(path: string, options: SimpleStripeRequestSearchOptions): Promise<SimpleStripeSearchResult<T>> {
    if (typeof options.query !== "string" || options.query.trim().length === 0) {
      return {
        ok: false,
        error: {
          kind: "validation",
          message: "Search query must be a non-empty string."
        }
      };
    }

    if (options.limit !== undefined && (!Number.isInteger(options.limit) || options.limit < 0)) {
      return {
        ok: false,
        error: {
          kind: "validation",
          message: "Search limit must be a non-negative integer."
        }
      };
    }

    if (options.limit === 0) {
      return {
        ok: true,
        data: [],
        hasMore: false
      };
    }

    const requestedLimit = options.limit ?? Number.POSITIVE_INFINITY;
    const collected: T[] = [];
    const batchSize = Math.min(100, requestedLimit);
    let totalCount: number | undefined;

    let page = options.page;

    while (true) {
      const params: Record<string, unknown> = {
        ...options.params,
        query: options.query,
        limit: batchSize,
        expand: appendSearchExpandTotalCount(options.params?.expand)
      };

      if (page) {
        params.page = page;
      }

      // Stripe might return a single entry instead of a search payload because we don't know what path has been supplied to us here.
      const result = await this.request<StripeSearchPayload<T> | T>("GET", path, {
        ...options,
        params
      });

      if (!result.ok) {
        return result;
      }

      if (!isStripeListPayload(result.data)) {
        return {
          ok: true,
          data: [ result.data ],
          hasMore: false
        };
      }

      collected.push(...result.data.data);
      totalCount = typeof result.data.total_count === "number" ? result.data.total_count : totalCount;

      const hasReachedLimit = collected.length >= requestedLimit;
      const shouldContinue = !hasReachedLimit && !!result.data.has_more && typeof result.data.next_page === "string" && result.data.data.length > 0;

      if (shouldContinue) {
        page = result.data.next_page;
        continue;
      }

      const data = collected.slice(0, requestedLimit);

      if (hasReachedLimit && result.data.has_more && typeof result.data.next_page === "string") {
        return {
          ok: true,
          data,
          hasMore: true,
          nextPage: result.data.next_page,
          ...(totalCount !== undefined ? { totalCount } : {})
        };
      }

      return {
        ok: true,
        data,
        hasMore: false,
        ...(totalCount !== undefined ? { totalCount } : {})
      };
    }
  }

  public async request<T>(method: string, path: string, options: SimpleStripeRequestOptions = {}): Promise<SimpleStripeResult<T>> {
    const preparedRequest = this.prepareRequest(method, path, options);

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const { shouldReturn, delayMs, result } = await this.executeAttempt<T>(preparedRequest);

      if (shouldReturn) {
        return result;
      }

      if (attempt === this.maxRetries) {
        return result;
      }

      await sleepMs(delayMs);
    }

    // The loop always returns, but having an explicit fallback keeps TypeScript happy
    // and makes the "impossible" control flow obvious to future readers.
    return {
      ok: false,
      error: {
        kind: "fetch",
        message: "Stripe request did not produce a result."
      }
    };
  }

  private prepareRequest(method: string, path: string, options: SimpleStripeRequestOptions): PreparedRequest {
    const url = buildUrl(this.baseUrl, path, options.params);
    const headers = buildHeaders(this.headers, options.headers);
    const body = buildRequestBody(method, headers, options);

    return {
      url,
      method,
      headers,
      body
    };
  }

  private async executeAttempt<T>(preparedRequest: PreparedRequest): Promise<ExecutedAttemptOutcome<T>> {
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), this.timeoutMs);

    try {
      const fetchOptions: any = {
        headers: preparedRequest.headers,
        method: preparedRequest.method,
        signal: timeoutController.signal
      };

      if (preparedRequest.body) {
        fetchOptions.body = preparedRequest.body;
      }

      const response = await fetch(preparedRequest.url, fetchOptions);

      const json = await jsonParseWithCatch(response);

      if (response.ok) {
        if (json === null) {
          return {
            shouldReturn: true,
            delayMs: 0,
            result: {
              ok: false,
              error: {
                kind: "decode",
                message: "Stripe returned a successful response, but the body was not valid JSON.",
                status: response.status
              }
            }
          };
        }

        return {
          shouldReturn: true,
          delayMs: 0,
          result: {
            ok: true,
            data: json as T,
            meta: {
              status: response.status,
              headers: response.headers
            }
          }
        };
      }

      const shouldRetry = shouldRetryResponse(response, preparedRequest.method, preparedRequest.headers);

      const result = buildFailureFromResponse(response, json);

      return {
        shouldReturn: !shouldRetry,
        delayMs: computeRetryDelayMs(response),
        result
      };

    } catch (error) {
      let result: SimpleStripeFailure;

      if (isAbortError(error)) {
        result = {
          ok: false,
          error: {
            kind: "timeout",
            message: "Timed out after " + this.timeoutMs + "ms"
          }
        };

      } else {
        result = {
          ok: false,
          error: {
            kind: "fetch",
            message: String(error)
          }
        };
      }

      const shouldRetry = shouldRetryError(result.error, preparedRequest.method, preparedRequest.headers);

      return {
        shouldReturn: !shouldRetry,
        delayMs: RETRY_BASE_DELAY_MS,
        result
      };

    } finally {
      clearTimeout(timeoutId);
    }
  }
}

function buildHeaders(defaultHeaders: Headers, additionalHeaders?: Record<string, string>): Headers {
  const headers = new Headers(defaultHeaders);

  if (additionalHeaders) {
    for (const [ header, value ] of Object.entries(additionalHeaders)) { // eslint-disable-line no-restricted-syntax
      headers.set(header, value);
    }
  }

  return headers;
}

function buildUrl(baseUrl: string, path: string, params?: Record<string, unknown>): URL {
  const normalizedPath = path.startsWith("/") ? path : ('/' + path);

  const url = new URL(normalizedPath, baseUrl);

  if (params) {
    url.search = formurlencoded(params, properFormUrlEncodedOptions);
  }

  return url;
}

function buildRequestBody(method: string, headers: Headers, options: SimpleStripeRequestOptions): any {
  if (method === "GET" || !options.body) {
    return null;
  }

  if (options.bodyEncoding === "raw") {
    return options.body ?? null;
  }

  if (options.bodyEncoding === "json") {
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    return JSON.stringify(options.body);
  }

  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/x-www-form-urlencoded");
  }

  return formurlencoded(options.body, properFormUrlEncodedOptions);
}

function buildFailureFromResponse(response: Response, json: any): SimpleStripeFailure {
  if (isStripeErrorPayload(json)) {
    // https://docs.stripe.com/api/errors#errors-decline_code
    return {
      ok: false,
      error: {
        kind: "stripe",
        message: json?.error?.message ?? `Stripe request failed with status ${response.status}.`,
        code: json?.error?.code,
        type: json?.error?.type,
        status: response.status,
        raw: json
      }
    };
  }

  return {
    ok: false,
    error: {
      kind: "http",
      message: `Stripe request failed with status ${response.status}.`,
      status: response.status,
      raw: json
    }
  };
}

function isStripeListPayload<T>(value: unknown): value is StripeListPayload<T> {
  return typeof value === "object" && value !== null && Array.isArray((value as StripeListPayload<T>).data);
}

function appendSearchExpandTotalCount(expand: unknown): string[] {
  const values = Array.isArray(expand)
    ? expand.filter((value): value is string => typeof value === "string" && value.length > 0)
    : typeof expand === "string" && expand.length > 0
      ? [ expand ]
      : [];

  return values.includes("total_count") ? values : [ ...values, "total_count" ];
}
