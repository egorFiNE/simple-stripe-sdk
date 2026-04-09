export type SimpleStripeRequestOptions = {
  params?: Record<string, any>;
  headers?: Record<string, string>;
  bodyEncoding?: "form" | "json" | "raw";
  body?: any;
};

export type SimpleStripeRequestListOptions = SimpleStripeRequestOptions & {
  limit?: number;
  afterId?: string;
};

// The response is a Result pattern:

export type SimpleStripeSuccess<T> = {
  ok: true;
  data: T;
  meta: {
    status: number;
    headers: Headers;
  };
};

export type SimpleStripeError = {
  kind: "stripe" | "fetch" | "timeout" | "decode" | "http" | "validation";
  message: string;
  status?: number; // HTTP status. Not present on timeout.

  // Stripe error fields:
  code?: string;
  type?: string;

  //
  raw?: any;
};

export type SimpleStripeFailure = {
  ok: false;
  error: SimpleStripeError;
};

export type SimpleStripeResult<T> = SimpleStripeSuccess<T> | SimpleStripeFailure;

// This is a Result pattern as well, but the data returned is an array and supports pagation:

export type SimpleStripeListSuccess<T> = {
  ok: true;
  data: T[];
};

export type SimpleStripeListSuccessAllOfIt<T> = SimpleStripeListSuccess<T> & {
  hasMore: false;
};

export type SimpleStripeListSuccessHasMore<T> = SimpleStripeListSuccess<T> & {
  hasMore: true;
  lastId: string;
};

export type SimpleStripeListResult<T> = SimpleStripeListSuccessAllOfIt<T> | SimpleStripeListSuccessHasMore<T> | SimpleStripeFailure;
