# simple-stripe-sdk

`simple-stripe-sdk` is a thin zero-deps TypeScript client for the [Stripe REST API](https://docs.stripe.com/api).

## Philosophy

- Bring only the types you need for the request in front of you;
- Stay close to raw Stripe REST instead of mirroring Stripe's entire object model locally;
- No runtime dependencies;
- No hardcoded dependency on any Stripe API version;
- Keep the SDK as a thin layer over:
  - authorization
  - error handling
  - retry logic
  - request serialization
  - a pagination helper for list endpoints

This package does not try to generate or own Stripe's full schema universe. You define the request and response types you care about and nothing more. Stripe's own REST API [documentation](https://docs.stripe.com/api) is excellent and clearly lays out all the properties and types.

### Comparison with official Stripe SDK

1. The official Stripe SDK can feel like too much type gymnastics for what is, underneath, a straightforward HTTP API. This SDK takes the opposite approach: keep the client small, keep the behavior obvious, and let the caller bring only the types needed for each request.

2. If you are stuck on an older Stripe API version, tying yourself to an older official SDK release can become its own maintenance problem. If a security fix or a new Node compatibility fix lands only in newer SDK releases, you can end up stuck. This SDK deliberately leaves support for older API versions on Stripe's side, where it belongs. If Stripe still serves that API version, this client can keep talking to it.

## Install And Runtime

`simple-stripe-sdk` is ESM-only, targets Node `>=24`, Bun `>= 1.3` and typescript `>= 6.0`.

```bash
npm install simple-stripe-sdk
# or
# bun add simple-stripe-sdk
```

```ts
import { SimpleStripeClient } from "simple-stripe-sdk";

const client = new SimpleStripeClient(process.env.STRIPE_TEST_API_KEY);

type Customer = {
  id: string;
  name?: string | null;
  email?: string | null;
};

const response = await client.get<Customer>('/v1/customers/cust_xxxxx');

if (response.ok) {
  console.log(`Customer email is ${response.data.email} and name ${response.data.name}`);
} else {
  console.log(`Failed to get customer`);
  FIXME error serializer
}
```

## Public API

`SimpleStripeClient` exposes these basic methods:

- `get<T>(path, options?)`
- `post<T>(path, options?)`
- `patch<T>(path, options?)`
- `delete<T>(path, options?)`

And a list helper:

- `list<T>(path, options?)`

`options` are intentionally small:

- `params`: query string parameters;
- `body`: request body;
- `headers`: per-request headers in case you need to overwrite some.

(all fields are optional)

`list` request additional `options`:

- `limit`: maximum number of records to collect;
- `afterId`: initial `starting_after` cursor.

(all fields are optional)

## Result Pattern

Requests return an object with `ok` boolean property and data or error instead of throwing.

That keeps the control flow explicit and lets your code handle different errors without exceptions as the main API contract.

### Success

In case of `ok` being `true` the object will have `data` property.

```ts
if (response.ok) {
  console.log(`Customer email is ${response.data.email} and name ${response.data.name}`);
}
```

(`meta` is also there if you need it).

### Failure

```ts
if (!response.ok) {
  console.log(`Got ${resonse.error.kind} querying stripe!`);
}
```

Possible error kinds:

- `timeout`: the request exceeded `client.timeoutMs`;
- `fetch`: network or transport failure;
- `stripe`: Stripe returned a structured API error payload;
- `http`: Stripe returned a non-2xx response that was not recognized as a Stripe error payload;
- `decode`: Stripe responded successfully, but the body could not be parsed as JSON.

FIXME error stringifier
FIXME error insead of kind

## Examples

### `get()`

Use your own response type and call the raw Stripe endpoint you want.

```ts
import { SimpleStripeClient } from "simple-stripe-sdk";

const client = new SimpleStripeClient(process.env.STRIPE_TEST_API_KEY!);

type Customer = {
  id: string;
  name?: string | null;
  email?: string | null;
};

const result = await client.get<Customer>('/v1/customers/cust_xxxxx');

if (response.ok) {
  console.log(`Customer email is ${response.data.email} and name ${response.data.name}`);
} else {
  console.log(`Failed to get customer`);
}
```

### `post()`

`post()` form-encodes request bodies by default, which matches Stripe's `application/x-www-form-urlencoded` request style.

```ts
import { SimpleStripeClient } from "simple-stripe-sdk";

type Customer = {
  id: string;
  email: string | null;
};

const client = new SimpleStripeClient(process.env.STRIPE_TEST_API_KEY!);

const result = await client.post<Customer>("/v1/customers", {
  body: {
    email: "user@example.com",
    metadata: {
      source: "simple-stripe-sdk",
    },
  },
});

if (result.ok) {
  console.log(result.data.id);
} else {
  console.log(`Error creating customer`);
} FIXME error stringifier
```

If you need to POST a different `body`, set `bodyEncoding` explicitly.

To send json:

```ts
await client.post("/v1/test", {
  bodyEncoding: "json",
  body: { hello: "world" },
});
```

To send raw body:

```ts
await client.post("/v1/test", {
  bodyEncoding: "raw",
  body: Buffer.from("Hello")
});
```

The default `bodyEncoding` is `form`.

## The `list()` Helper

`list()` is a convenience helper around Stripe list endpoints. It keeps requesting pages until it collects the requested number of items or reaches the end of Stripe's list.

The helper returns `SimpleStripeListResult<T>`, which is either:

- a failure result
- a success with `hasMore: false`
- a success with `hasMore: true` and `lastId`

### `list()` options

- `limit`: maximum number of items to return. Default is scary: all of them.
- `afterId`: initial cursor, sent as Stripe's `starting_after`. Default: undefined, meaning let's start with the first record.
- `params`: any extra params to actually query Stripe.

### `list()` example

```ts
import { SimpleStripeClient } from "simple-stripe-sdk";

type Customer = {
  id: string;
  object: "customer";
  email?: string | null;
};

const client = new SimpleStripeClient(process.env.STRIPE_TEST_API_KEY!);

const result = await client.list<Customer>("/v1/customers", {
  limit: 300,
  params: {
    email: "boss@corporate.com"
  }
});

if (result.ok) {
  console.log(result.data.length); // The actual records
  console.log(result.hasMore); // Whether we have got to the end of the list

  if (result.hasMore) {
    console.log(result.lastId); // The last record we have got
  }
}
```

Notes:

- If Stripe has more records than your requested `limit`, the result is trimmed to that limit and returns `hasMore: true` with `lastId`.
- If the supplied path is not actually a Stripe list endpoint and Stripe returns a single entity, `list()` wraps that entity in a one-element array and returns `hasMore: false`.


## The `search()` Helper

TODO

## Stripe API version support

To specify API version explicitly - provide it as a second constructor argument:

```ts
import { SimpleStripeClient } from "simple-stripe-sdk";

const client = new SimpleStripeClient(
  process.env.STRIPE_TEST_API_KEY!,
  "2025-09-30.clover"
);
```

When provided, it is sent as the `Stripe-Version` header on every request. Otherwise your default API version for this api key is used.

## Send custom headers

To send custom headers per request you can specify them in the `headers` options:

```ts
const response = await client.get<Customer>('/v1/customers/cust_xxxxx', {
  headers: {
    "x-life": "is great!"
  }
});
```

## Retry Tradeoffs

Retry behavior is intentionally conservative:

- `GET` and `DELETE` may be retried on `409`, `429`, `5xx`, timeout, and fetch failures;
- mutating requests are only retried when it is safe to do so, meaning you provide an `Idempotency-Key`;
- `Retry-After` is respected when Stripe sends it.

This is a direct client for Stripe's API.

## Building And Testing

```bash
bun run build
bun run test
bun run test:live
bun run typecheck
bun run typecheck:consumer
bun run check
```

### Live tests

The live Stripe smoke test requires these environment variables to be set:

- `STRIPE_TEST_API_KEY`
- `STRIPE_TEST_API_VERSION`

Example:

```bash
STRIPE_TEST_API_KEY=sk_test_... \
STRIPE_TEST_API_VERSION=2025-09-30.clover \
bun run test:live
```

Smoke tests are read only and safe to run on a staging sandbox.

## Vendored `form-urlencoded`

This package has no npm runtime dependencies.

It does, however, vendor the `form-urlencoded` implementation directly in this repository:

- upstream project: [iambumblehead/form-urlencoded](https://github.com/iambumblehead/form-urlencoded)
- upstream license: MIT
- bundled files in this repo: `src/form-urlencoded.*`

That code is bundled into this project instead of being downloaded from npm at install time in order to reduce supply chain attach surface.

## Stripe Docs

- [Stripe API reference](https://docs.stripe.com/api)
- [Authentication](https://docs.stripe.com/api/authentication)
- [Versioning](https://docs.stripe.com/api/versioning)
- [Errors](https://docs.stripe.com/api/errors)
- [Pagination](https://docs.stripe.com/api/pagination)
- [Idempotent requests](https://docs.stripe.com/api/idempotent_requests)

## License

(The MIT License)

Copyright (c) Egor Egorov <me@egorfine.com>

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the 'Software'), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
of the Software, and to permit persons to whom the Software is furnished to do
so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
IN THE SOFTWARE.
