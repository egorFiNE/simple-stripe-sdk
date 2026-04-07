import { type SimpleStripeResult, StripeClient } from "../../src/index.js";

type CustomerListResponse = {
  object: "list";
  data: Array<{
    id: string;
    email: string | null;
  }>;
};

const client = new StripeClient("sk_test_123");

async function example(): Promise<void> {
  const result: SimpleStripeResult<CustomerListResponse> = await client.get<CustomerListResponse>(
    "/v1/customers",
    {
      params: {
        limit: 1,
      },
    },
  );

  if (result.ok) {
    result.data.data[0]?.email satisfies string | null | undefined;
  }

  if (!result.ok) {
    result.error.kind satisfies "timeout" | "fetch" | "stripe" | "http" | "decode";
  }
}

void example;
