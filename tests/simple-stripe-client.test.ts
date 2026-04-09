import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SimpleStripeClient } from "../src/index.js";

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const r = new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "-type": "application/json",
      "request-id": "req_test",
      ...init.headers,
    },
    ...init,
  });

  // Having Content-Type set in the constructor sometimes fails with Bun 1.3.11 and vitest 4.1.3.
  r.headers.set("Content-Type", "application/json");

  return r;
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
      expect(result.isRaw).toBe(false);
      // @ts-ignore
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

  it.each([-1, 1.5, Number.NaN])("rejects invalid list limits: %p", async (limit) => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as typeof fetch;

    const client = new SimpleStripeClient("sk_test_123");
    const result = await client.list<{ id: string }>("/v1/customers", {
      limit,
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: false,
      error: {
        kind: "validation",
        message: "Limit must be a non-negative integer.",
      },
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

  it("returns a single entity wrapped in an array when search path is not a search endpoint", async () => {
    globalThis.fetch = vi.fn(async () => {
      return jsonResponse({
        id: "cus_single",
        object: "customer",
      });
    }) as typeof fetch;

    const client = new SimpleStripeClient("sk_test_123");
    const result = await client.search<{ id: string; object: string }>("/v1/customers/cus_single", {
      query: "email:'single@example.com'",
    });

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

  it("returns an empty search success without calling Stripe when limit is zero", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as typeof fetch;

    const client = new SimpleStripeClient("sk_test_123");
    const result = await client.search<{ id: string }>("/v1/customers/search", {
      query: "name:'Jane Doe'",
      limit: 0,
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: true,
      data: [],
      hasMore: false,
    });
  });

  it.each([-1, 1.5, Number.NaN])("rejects invalid search limits", async (limit) => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as typeof fetch;

    const client = new SimpleStripeClient("sk_test_123");
    const result = await client.search<{ id: string }>("/v1/customers/search", {
      query: "metadata['team']:'core'",
      limit,
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: false,
      error: {
        kind: "validation",
        message: "Limit must be a non-negative integer.",
      },
    });
  });

  it.each([undefined, "", "   "])("rejects invalid search query: %p", async (query) => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as typeof fetch;

    const client = new SimpleStripeClient("sk_test_123");
    const result = await client.search<{ id: string }>("/v1/customers/search", {
      query: query as string,
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: false,
      error: {
        kind: "validation",
        message: "Search query must be a non-empty string.",
      },
    });
  });

  it("uses page only on the first search request and then continues with next_page", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async (input: RequestInfo | URL) => {
        expect(String(input)).toBe("https://api.stripe.com/v1/customers/search?query=name%3A%27Jane%20Doe%27&limit=3&expand%5B0%5D=total_count&page=page_1");

        return jsonResponse({
          object: "search_result",
          data: [listItem("cus_1"), listItem("cus_2")],
          has_more: true,
          next_page: "page_2",
          total_count: 17,
        });
      })
      .mockImplementationOnce(async (input: RequestInfo | URL) => {
        expect(String(input)).toBe("https://api.stripe.com/v1/customers/search?query=name%3A%27Jane%20Doe%27&limit=3&expand%5B0%5D=total_count&page=page_2");

        return jsonResponse({
          object: "search_result",
          data: [listItem("cus_3")],
          has_more: false,
          total_count: 17,
        });
      });

    globalThis.fetch = fetchMock as typeof fetch;

    const client = new SimpleStripeClient("sk_test_123");
    const result = await client.search<{ id: string }>("/v1/customers/search", {
      query: "name:'Jane Doe'",
      limit: 3,
      page: "page_1",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      ok: true,
      data: [listItem("cus_1"), listItem("cus_2"), listItem("cus_3")],
      hasMore: false,
      totalCount: 17,
    });
  });

  it("overfetches search results in batches of 100 and trims to the requested limit", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async (input: RequestInfo | URL) => {
        expect(String(input)).toBe("https://api.stripe.com/v1/customers/search?query=metadata%5Bteam%5D%3A%27core%27&limit=100&expand%5B0%5D=total_count");

        return jsonResponse({
          object: "search_result",
          data: Array.from({ length: 100 }, (_, index) => listItem(`cus_${index + 1}`)),
          has_more: true,
          next_page: "page_2",
          total_count: 999,
        });
      })
      .mockImplementationOnce(async (input: RequestInfo | URL) => {
        expect(String(input)).toBe("https://api.stripe.com/v1/customers/search?query=metadata%5Bteam%5D%3A%27core%27&limit=100&expand%5B0%5D=total_count&page=page_2");

        return jsonResponse({
          object: "search_result",
          data: Array.from({ length: 100 }, (_, index) => listItem(`cus_${index + 101}`)),
          has_more: true,
          next_page: "page_3",
          total_count: 999,
        });
      });

    globalThis.fetch = fetchMock as typeof fetch;

    const client = new SimpleStripeClient("sk_test_123");
    const result = await client.search<{ id: string }>("/v1/customers/search", {
      query: "metadata[team]:'core'",
      limit: 150,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.data).toHaveLength(150);
      expect(result.data[0]).toEqual(listItem("cus_1"));
      expect(result.data.at(-1)).toEqual(listItem("cus_150"));
      expect(result.hasMore).toBe(true);
      expect(result.totalCount).toBe(999);

      if (result.hasMore) {
        expect(result.nextPage).toBe("page_3");
      }
    }
  });

  it("returns all search items with hasMore false when Stripe exhausts before the limit", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async (input: RequestInfo | URL) => {
        expect(String(input)).toBe("https://api.stripe.com/v1/customers/search?query=email%3A%27boss%40corporate.com%27&limit=100&expand%5B0%5D=total_count");

        return jsonResponse({
          object: "search_result",
          data: [listItem("cus_1"), listItem("cus_2")],
          has_more: true,
          next_page: "page_2",
          total_count: 3,
        });
      })
      .mockImplementationOnce(async (input: RequestInfo | URL) => {
        expect(String(input)).toBe("https://api.stripe.com/v1/customers/search?query=email%3A%27boss%40corporate.com%27&limit=100&expand%5B0%5D=total_count&page=page_2");

        return jsonResponse({
          object: "search_result",
          data: [listItem("cus_3")],
          has_more: false,
          total_count: 3,
        });
      });

    globalThis.fetch = fetchMock as typeof fetch;

    const client = new SimpleStripeClient("sk_test_123");
    const result = await client.search<{ id: string }>("/v1/customers/search", {
      query: "email:'boss@corporate.com'",
      limit: 150,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      ok: true,
      data: [listItem("cus_1"), listItem("cus_2"), listItem("cus_3")],
      hasMore: false,
      totalCount: 3,
    });
  });

  it("preserves existing search expands and appends total_count", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe("https://api.stripe.com/v1/customers/search?expand%5B0%5D=data.default_source&expand%5B1%5D=total_count&query=name%3A%27Jane%20Doe%27&limit=1");

      return jsonResponse({
        object: "search_result",
        data: [listItem("cus_1")],
        has_more: false,
        total_count: 1,
      });
    }) as typeof fetch;

    const client = new SimpleStripeClient("sk_test_123");
    const result = await client.search<{ id: string }>("/v1/customers/search", {
      query: "name:'Jane Doe'",
      limit: 1,
      params: {
        expand: ["data.default_source"],
      },
    });

    expect(result).toEqual({
      ok: true,
      data: [listItem("cus_1")],
      hasMore: false,
      totalCount: 1,
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

  it("returns Stripe errors unchanged from search requests", async () => {
    globalThis.fetch = vi.fn(async () => {
      return jsonResponse(
        {
          error: {
            type: "invalid_request_error",
            message: "Invalid query.",
            code: "parameter_invalid_string_empty",
          },
        },
        {
          status: 400,
        },
      );
    }) as typeof fetch;

    const client = new SimpleStripeClient("sk_test_123");
    const result = await client.search<{ id: string }>("/v1/customers/search", {
      query: "email:''",
      limit: 100,
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        kind: "stripe",
        code: "parameter_invalid_string_empty",
        status: 400,
      },
    });
  });
});
