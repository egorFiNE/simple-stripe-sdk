import { StripeClient, isErr, isOk, type StripeResult } from "../../src/index.js";

type CustomerListResponse = {
  object: "list";
  data: Array<{
    id: string;
    email: string | null;
  }>;
};

const client = new StripeClient("sk_test_123");

async function example(): Promise<void> {
  const result: StripeResult<CustomerListResponse> = await client.get<CustomerListResponse>(
    "/v1/customers",
    {
      params: {
        limit: 1,
      },
    },
  );

  if (isOk(result)) {
    result.data.data[0]?.email satisfies string | null | undefined;
  }

  if (isErr(result)) {
    result.error.kind satisfies "timeout" | "fetch" | "stripe" | "http" | "decode";
  }
}

void example;
