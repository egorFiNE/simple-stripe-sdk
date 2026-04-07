export { StripeClient } from "./stripe-client.js";

export type {
  StripeApiError,
  StripeDecodeError,
  StripeError,
  StripeFailure,
  StripeFetchError,
  StripeFormRequestOptions,
  StripeHttpError,
  StripeJsonRequestOptions,
  StripeRawRequestOptions,
  StripeRequestOptions,
  StripeResult,
  StripeSuccess,
  StripeTimeoutError,
} from "./types.js";

export function isOk<T>(
  result: import("./types.js").StripeResult<T>,
): result is import("./types.js").StripeSuccess<T> {
  return result.ok;
}

export function isErr<T>(
  result: import("./types.js").StripeResult<T>,
): result is import("./types.js").StripeFailure {
  return !result.ok;
}
