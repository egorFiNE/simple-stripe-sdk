import { describe, expect, it } from "vitest";

import { toStripeSearchParams } from "../src/serialization.js";

describe("toStripeSearchParams", () => {
  it("serializes nested objects using Stripe bracket notation", () => {
    const params = toStripeSearchParams({
      customer: "cus_123",
      metadata: {
        team: "core",
        nested: {
          flag: true,
        },
      },
    });

    expect(params.toString()).toBe(
      "customer=cus_123&metadata%5Bteam%5D=core&metadata%5Bnested%5D%5Bflag%5D=true",
    );
  });

  it("serializes arrays of scalars with empty brackets", () => {
    const params = toStripeSearchParams({
      expand: ["customer", "data.invoice"],
    });

    expect(params.getAll("expand[]")).toEqual(["customer", "data.invoice"]);
  });

  it("serializes arrays of objects with indexes to preserve structure", () => {
    const params = toStripeSearchParams({
      line_items: [
        {
          price: "price_123",
          quantity: 2,
        },
        {
          price: "price_456",
          quantity: 1,
        },
      ],
    });

    expect(params.toString()).toBe(
      "line_items%5B0%5D%5Bprice%5D=price_123&line_items%5B0%5D%5Bquantity%5D=2&line_items%5B1%5D%5Bprice%5D=price_456&line_items%5B1%5D%5Bquantity%5D=1",
    );
  });

  it("skips undefined but preserves null as an empty value", () => {
    const params = toStripeSearchParams({
      provided: null,
      skipped: undefined,
    });

    expect(params.toString()).toBe("provided=");
  });
});
