import { describe, expect, it } from "vitest";

import { SimpleStripeClient } from "../src/index.js";

// @ts-ignore
const stripeKey = process.env.STRIPE_TEST_API_KEY as string;
// @ts-ignore
const stripeVersion = process.env.STRIPE_TEST_API_VERSION as string;

describe.runIf(Boolean(stripeKey && stripeVersion))("live Stripe smoke tests", () => {
  it("lists a small page of customers against Stripe", async () => {
    const client = new SimpleStripeClient(stripeKey, stripeVersion);

    const result = await client.list<{
      id: string;
      email: string;
    }>("/v1/customers", {
      params: {
        limit: 1,
      },
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(Array.isArray(result.data)).toBe(true);
    }
  });
});
