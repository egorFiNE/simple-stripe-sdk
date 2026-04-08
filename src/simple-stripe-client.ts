import type { SimpleStripeFailure, SimpleStripeRequestOptions, SimpleStripeResult } from "./types.js";
import { computeRetryDelayMs, isAbortError, shouldRetryError, shouldRetryResponse, sleepMs, isStripeErrorPayload, jsonParseOrThrow } from "./utils.js";
import { DEFAULT_BASE_URL, DEFAULT_MAX_RETRIES, RETRY_BASE_DELAY_MS, DEFAULT_TIMEOUT_MS, USER_AGENT } from "./constants.js";
import formurlencoded, { type formUrlEncoded } from './form-urlencoded.mjs';

const properFormUrlEncodedOptions: formUrlEncoded.FormEncodedOptions = {
  sorted: false,
  skipIndex: false,
  ignorenull: false,
  ignoreEmptyArray: false,
  skipBracket: false,
  useDot: false,
  whitespace: "%20"
};

interface PreparedRequest {
  url: URL;
  method: string;
  headers: Headers;
  body?: any;
}

type ExecutedAttemptOutcome<T> = {
  shouldReturn: boolean;
  delayMs: number;
  result: SimpleStripeResult<T>;
};

export class SimpleStripeClient {
  public timeoutMs = DEFAULT_TIMEOUT_MS;
  public baseUrl = DEFAULT_BASE_URL;
  public readonly headers = new Headers();
  public maxRetries = DEFAULT_MAX_RETRIES;;

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
      },
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
        signal: timeoutController.signal,
      };

      if (preparedRequest.body) {
        fetchOptions.body = preparedRequest.body;
      }

      const response = await fetch(preparedRequest.url, fetchOptions);

      const json = await jsonParseOrThrow(response);

      if (response.ok) {
        return {
          shouldReturn: true,
          delayMs: 0,
          result: buildSuccessResult<T>(response, json)
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
            kind: "timeout"
          },
        };

      } else {
        result = {
          ok: false,
          error: {
            kind: "fetch",
            message: String(error)
          },
        }
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
      for (const [ header, value ] of Object.entries(additionalHeaders)) {
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

function buildSuccessResult<T>(response: Response, json: any): SimpleStripeResult<T> {
  if (json === null) {
    return {
      ok: false,
      error: {
        kind: "decode",
        message: "Stripe returned a successful response, but the body was not valid JSON.",
        status: response.status
      },
    };
  }

  return {
    ok: true,
    data: json as T,
    meta: {
      status: response.status,
      headers: response.headers
    }
  };
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
      body: json
    },
  };
}
