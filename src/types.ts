export interface SimpleStripeRequestOptions {
  params?: Record<string, any>;
  headers?: Record<string, string>;
  bodyEncoding?: "form" | "json" | "raw";
  body?: any;
}

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
