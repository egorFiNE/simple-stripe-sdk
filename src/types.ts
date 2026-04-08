export interface SimpleStripeRequestOptions {
  params?: Record<string, any>;
  headers?: Record<string, string>;
  bodyEncoding?: "form" | "json" | "raw";
  body?: any;
}

export interface SimpleStripeRequestListOptions extends SimpleStripeRequestOptions {
  limit?: number;
  afterId?: string;
};

// The response is a Result pattern:

export interface SimpleStripeSuccess<T> {
  ok: true;
  data: T;
  meta: {
    status: number;
    headers: Headers;
  };
}

export interface SimpleStripeError {
  kind: "stripe" | "fetch" | "timeout" | "decode" | "http";
  message: string;
  status?: number; // HTTP status. Not present on timeout.

  // Stripe error fields:
  code?: string;
  type?: string;

  //
  raw?: any;
}

export interface SimpleStripeFailure {
  ok: false;
  error: SimpleStripeError;
}

export type SimpleStripeResult<T> = SimpleStripeSuccess<T> | SimpleStripeFailure;

// This is a Result pattern as well, but the data returned is an array and supports pagation:

export type SimpleStripeListSuccess<T> = {
  ok: true;
  data: T[];
}

export type SimpleStripeListSuccessAllOfIt<T> = SimpleStripeListSuccess<T> & {
  hasMore: false;
}

export type SimpleStripeListSuccessHasMore<T> = SimpleStripeListSuccess<T> & {
  hasMore: true;
  lastId: string;
}

export type SimpleStripeListResult<T> = SimpleStripeListSuccessAllOfIt<T> | SimpleStripeListSuccessHasMore<T> | SimpleStripeFailure;
