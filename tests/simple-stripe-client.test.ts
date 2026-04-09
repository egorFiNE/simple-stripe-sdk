import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SimpleStripeClient } from "../src/index.js";

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

function listItem(id: string) {
  return { id };
}

describe("SimpletripeClient", () => {
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

    const client = new SimpleStripeClient("sk_test_123", "2025-09-30.clover");
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

  it("serializes nested query params using form-urlencoded", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe(
        "https://api.stripe.com/v1/customers?customer=cus_123&metadata%5Bteam%5D=core&metadata%5Bnested%5D%5Bflag%5D=true",
      );

      return jsonResponse({
        object: "list",
        data: [],
      });
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const client = new SimpleStripeClient("sk_test_123");

    const result = await client.get<{ object: string; data: unknown[] }>("/v1/customers", {
      params: {
        customer: "cus_123",
        metadata: {
          team: "core",
          nested: {
            flag: true,
          },
        },
      },
    });

    expect(result.ok).toBe(true);
  });

  it("serializes array query params using form-urlencoded", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe(
        "https://api.stripe.com/v1/prices?expand%5B0%5D=product&expand%5B1%5D=data.currency_options",
      );

      return jsonResponse({
        object: "list",
        data: [],
      });
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const client = new SimpleStripeClient("sk_test_123");

    const result = await client.get<{ object: string; data: unknown[] }>("/v1/prices", {
      params: {
        expand: ["product", "data.currency_options"],
      },
    });

    expect(result.ok).toBe(true);
  });

  it("preserves null-ish query intent and skips undefined values", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe("https://api.stripe.com/v1/customers?provided=null");

      return jsonResponse({
        object: "list",
        data: [],
      });
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const client = new SimpleStripeClient("sk_test_123");

    const result = await client.get<{ object: string; data: unknown[] }>("/v1/customers", {
      params: {
        provided: null,
        skipped: undefined,
      },
    });

    expect(result.ok).toBe(true);
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

    const client = new SimpleStripeClient("sk_test_123");

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

    const client = new SimpleStripeClient("sk_test_123");

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

    const client = new SimpleStripeClient("sk_test_123");

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

    const client = new SimpleStripeClient("sk_test_123");

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

    const client = new SimpleStripeClient("sk_test_123");
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

    const client = new SimpleStripeClient("sk_test_123");
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

    const client = new SimpleStripeClient("sk_test_123");
    client.maxRetries = 2;

    const result = await client.post<{ id: string }>("/v1/customers", {
      body: {
        email: "user@example.com",
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
  });

  it("retries POST when an idempotency key is present", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network down"))
      .mockResolvedValueOnce(
        jsonResponse({
          id: "cus_123",
        }),
      );

    globalThis.fetch = fetchMock as typeof fetch;

    const client = new SimpleStripeClient("sk_test_123");
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

    const client = new SimpleStripeClient("sk_test_123", "2025-09-30.clover");
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

    const client = new SimpleStripeClient("sk_test_123", "2025-09-30.clover");

    const result = await client.get<{ ok: boolean }>("/v1/customers", {
      headers: {
        "Stripe-Account": "acct_123",
      },
    });

    expect(result.ok).toBe(true);
  });

  it("returns a single entity wrapped in an array when list path is not a list endpoint", async () => {
    globalThis.fetch = vi.fn(async () => {
      return jsonResponse({
        id: "cus_single",
        object: "customer",
      });
    }) as typeof fetch;

    const client = new SimpleStripeClient("sk_test_123");
    const result = await client.list<{ id: string; object: string }>("/v1/customers/cus_single");

    expect(result).toEqual({
      ok: true,
      data: [
        {
          id: "cus_single",
          object: "customer",
        },
      ],
      hasMore: false,
    });
  });

  it("returns an empty success without calling Stripe when limit is zero", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as typeof fetch;

    const client = new SimpleStripeClient("sk_test_123");
    const result = await client.list<{ id: string }>("/v1/customers", {
      limit: 0,
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: true,
      data: [],
      hasMore: false,
    });
  });

  it("uses afterId only on the first page request", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async (input: RequestInfo | URL) => {
        expect(String(input)).toBe("https://api.stripe.com/v1/customers?limit=3&starting_after=cus_after");

        return jsonResponse({
          object: "list",
          data: [listItem("cus_1"), listItem("cus_2")],
          has_more: true,
        });
      })
      .mockImplementationOnce(async (input: RequestInfo | URL) => {
        expect(String(input)).toBe("https://api.stripe.com/v1/customers?limit=3&starting_after=cus_2");

        return jsonResponse({
          object: "list",
          data: [listItem("cus_3")],
          has_more: false,
        });
      });

    globalThis.fetch = fetchMock as typeof fetch;

    const client = new SimpleStripeClient("sk_test_123");
    const result = await client.list<{ id: string }>("/v1/customers", {
      limit: 3,
      afterId: "cus_after",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      ok: true,
      data: [listItem("cus_1"), listItem("cus_2"), listItem("cus_3")],
      hasMore: false,
    });
  });

  it("overfetches in batches of 100 and trims to the requested limit", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async (input: RequestInfo | URL) => {
        expect(String(input)).toBe("https://api.stripe.com/v1/customers?limit=100");

        return jsonResponse({
          object: "list",
          data: Array.from({ length: 100 }, (_, index) => listItem(`cus_${index + 1}`)),
          has_more: true,
        });
      })
      .mockImplementationOnce(async (input: RequestInfo | URL) => {
        expect(String(input)).toBe("https://api.stripe.com/v1/customers?limit=100&starting_after=cus_100");

        return jsonResponse({
          object: "list",
          data: Array.from({ length: 100 }, (_, index) => listItem(`cus_${index + 101}`)),
          has_more: true,
        });
      });

    globalThis.fetch = fetchMock as typeof fetch;

    const client = new SimpleStripeClient("sk_test_123");
    const result = await client.list<{ id: string }>("/v1/customers", {
      limit: 150,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.data).toHaveLength(150);
      expect(result.data[0]).toEqual(listItem("cus_1"));
      expect(result.data.at(-1)).toEqual(listItem("cus_150"));
      expect(result.hasMore).toBe(true);

      if (result.hasMore) {
        expect(result.lastId).toBe("cus_150");
      }
    }
  });

  it("returns all items with hasMore false when Stripe exhausts before the limit", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async (input: RequestInfo | URL) => {
        expect(String(input)).toBe("https://api.stripe.com/v1/customers?limit=100");

        return jsonResponse({
          object: "list",
          data: [listItem("cus_1"), listItem("cus_2")],
          has_more: true,
        });
      })
      .mockImplementationOnce(async (input: RequestInfo | URL) => {
        expect(String(input)).toBe("https://api.stripe.com/v1/customers?limit=100&starting_after=cus_2");

        return jsonResponse({
          object: "list",
          data: [listItem("cus_3")],
          has_more: false,
        });
      });

    globalThis.fetch = fetchMock as typeof fetch;

    const client = new SimpleStripeClient("sk_test_123");
    const result = await client.list<{ id: string }>("/v1/customers", {
      limit: 150,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      ok: true,
      data: [listItem("cus_1"), listItem("cus_2"), listItem("cus_3")],
      hasMore: false,
    });
  });

  it("returns Stripe errors unchanged from list requests", async () => {
    globalThis.fetch = vi.fn(async () => {
      return jsonResponse(
        {
          error: {
            type: "invalid_request_error",
            message: "No such customer.",
            code: "resource_missing",
          },
        },
        {
          status: 404,
        },
      );
    }) as typeof fetch;

    const client = new SimpleStripeClient("sk_test_123");
    const result = await client.list<{ id: string }>("/v1/customers", {
      limit: 100,
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        kind: "stripe",
        code: "resource_missing",
        status: 404,
      },
    });
  });
});
