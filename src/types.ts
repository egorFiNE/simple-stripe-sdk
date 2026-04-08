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

export interface SimpleStripeFailure {
  ok: false;
  error: SimpleStripeError;
}

export interface SimpleStripeSuccess<T> {
  ok: true;
  data: T;
  meta: {
    status: number;
    headers: Headers;
  };
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

// Variety of stripe errors is here to make sure types are properly used in the simple-stripe-sdk code; not a type gymnastics exercise.

export interface SimpleStripeTimeoutError {
  kind: "timeout";
}

export interface SimpleStripeFetchError {
  kind: "fetch";
  message: string;
}

export interface SimpleStripeApiError {
  kind: "stripe";
  message: string;
  code?: string;
  type?: string;
  status: number;
  raw: any;
}

export interface SimpleStripeHttpError {
  kind: "http";
  message: string;
  status: number;
  body?: any;
}

export interface SimpleStripeDecodeError {
  kind: "decode";
  message: string;
  status: number;
}

export type SimpleStripeError =
  | SimpleStripeTimeoutError
  | SimpleStripeFetchError
  | SimpleStripeApiError
  | SimpleStripeHttpError
  | SimpleStripeDecodeError;
