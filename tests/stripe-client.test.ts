import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StripeClient } from "../src/index.js";

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "request-id": "req_test",
      ...init.headers,
    },
    ...init,
  });
}

describe("StripeClient", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
  });

  it("sends auth and api version headers on GET requests", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://api.stripe.com/v1/customers?limit=1");
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer sk_test_123");
      expect(new Headers(init?.headers).get("Stripe-Version")).toBe("2025-09-30.clover");
      expect(init?.method).toBe("GET");

      return jsonResponse({
        object: "list",
        data: [],
      });
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const client = new StripeClient("sk_test_123", "2025-09-30.clover");
    const result = await client.get<{ object: string; data: unknown[] }>("/v1/customers", {
      params: {
        limit: 1,
      },
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.data.object).toBe("list");
    }
  });

  it("form-encodes POST bodies by default", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(new Headers(init?.headers).get("Content-Type")).toBe(
        "application/x-www-form-urlencoded",
      );
      expect(init?.body).toBe("email=user%40example.com&metadata%5Bteam%5D=sdk");

      return jsonResponse({
        id: "cus_123",
      });
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const client = new StripeClient("sk_test_123");

    const result = await client.post<{ id: string }>("/v1/customers", {
      body: {
        email: "user@example.com",
        metadata: {
          team: "sdk",
        },
      },
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        id: "cus_123",
      },
    });
  });

  it("allows json request bodies when asked explicitly", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("Content-Type")).toBe("application/json");
      expect(init?.body).toBe(JSON.stringify({ hello: "world" }));

      return jsonResponse({
        echoed: true,
      });
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const client = new StripeClient("sk_test_123");

    const result = await client.post<{ echoed: boolean }>("/v1/test", {
      bodyEncoding: "json",
      body: {
        hello: "world",
      },
    });

    expect(result.ok).toBe(true);
  });

  it("maps Stripe API errors into the error branch", async () => {
    globalThis.fetch = vi.fn(async () => {
      return jsonResponse(
        {
          error: {
            type: "invalid_request_error",
            message: "Missing required param: email.",
            code: "parameter_missing",
          },
        },
        {
          status: 400,
        },
      );
    }) as typeof fetch;

    const client = new StripeClient("sk_test_123");

    const result = await client.post<{ never: true }>("/v1/customers", {
      body: {},
    });

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error.kind).toBe("stripe");

      if (result.error.kind === "stripe") {
        expect(result.error.code).toBe("parameter_missing");
      }
    }
  });

  it("maps invalid JSON success responses into decode errors", async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response("not-json", {
        status: 200,
        headers: {
          "request-id": "req_bad_json",
        },
      });
    }) as typeof fetch;

    const client = new StripeClient("sk_test_123");

    const result = await client.get<{ ok: true }>("/v1/customers");

    expect(result).toMatchObject({
      ok: false,
      error: {
        kind: "decode"
      },
    });
  });

  it("retries retryable server responses and reports the retry count", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: {
              type: "api_error",
              message: "Temporary issue",
            },
          },
          {
            status: 500,
            headers: {
              "request-id": "req_retry_1",
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          {
            id: "cus_after_retry",
          },
          {
            status: 200,
            headers: {
              "request-id": "req_retry_2",
            },
          },
        ),
      );

    globalThis.fetch = fetchMock as typeof fetch;

    const client = new StripeClient("sk_test_123");
    client.maxRetries = 2;

    const promise = client.get<{ id: string }>("/v1/customers");

    await vi.runAllTimersAsync();

    const result = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      ok: true,
      data: {
        id: "cus_after_retry",
      },
      meta: {
        headers: {},
        status: 200
      },
    });
  });

  it("honors Retry-After before retrying", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: {
              type: "rate_limit_error",
              message: "Slow down",
            },
          },
          {
            status: 429,
            headers: {
              "Retry-After": "2",
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          ok: true,
        }),
      );

    globalThis.fetch = fetchMock as typeof fetch;

    const client = new StripeClient("sk_test_123");
    client.maxRetries = 1;

    const promise = client.get<{ ok: boolean }>("/v1/customers");

    await vi.advanceTimersByTimeAsync(1_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    await Promise.resolve();
    await Promise.resolve();

    const result = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
  });

  it("does not retry POST without an idempotency key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          error: {
            type: "api_error",
            message: "Temporary issue",
          },
        },
        {
          status: 500,
        },
      ),
    );

    globalThis.fetch = fetchMock as typeof fetch;

    const client = new StripeClient("sk_test_123");
    client.maxRetries = 2;

    const result = await client.post<{ id: string }>("/v1/customers", {
      body: {
        email: "user@example.com",
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
  });

  it.skip("retries POST when an idempotency key is present", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network down"))
      .mockResolvedValueOnce(
        jsonResponse({
          id: "cus_123",
        }),
      );

    globalThis.fetch = fetchMock as typeof fetch;

    const client = new StripeClient("sk_test_123");
    client.maxRetries = 1;

    const promise = client.post<{ id: string }>("/v1/customers", {
      headers: {
        "Idempotency-Key": "idem_123",
      },
      body: {
        email: "user@example.com",
      },
    });

    await vi.runAllTimersAsync();

    const result = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);

    expect(result).toMatchObject({
      ok: true,
      data: {
        id: "cus_123",
      },
    });
  });

  it("returns timeout errors when fetch takes too long", async () => {
    globalThis.fetch = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    ) as typeof fetch;

    const client = new StripeClient("sk_test_123", "2025-09-30.clover");
    client.timeoutMs = 25;
    client.maxRetries = 0;

    const promise = client.get<{ ok: true }>("/v1/customers");

    await vi.advanceTimersByTimeAsync(25);

    const result = await promise;

    expect(result).toMatchObject({
      ok: false,
      error: {
        kind: "timeout"
      },
    });
  });

  it("lets individual requests override headers only", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init: RequestInit) => {
      const fuckThat = init.headers as Headers;
      expect(fuckThat.get("Stripe-Version")).toBe("2025-09-30.clover");
      expect(fuckThat.get("Stripe-Account")).toBe("acct_123");

      return jsonResponse({
        ok: true,
      });
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const client = new StripeClient("sk_test_123", "2025-09-30.clover");

    const result = await client.get<{ ok: boolean }>("/v1/customers", {
      headers: {
        "Stripe-Account": "acct_123",
      },
    });

    expect(result.ok).toBe(true);
  });
});
