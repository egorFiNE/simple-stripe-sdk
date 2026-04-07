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

export interface SimpleStripeRequestBaseOptions {
  params?: Record<string, any>;
  headers?: Record<string, string>;
}

export interface SimpleStripeFormRequestOptions extends SimpleStripeRequestBaseOptions {
  bodyEncoding?: "form";
  body?: Record<string, any>; // FIXME lessen detection on body
}

export interface SimpleStripeJsonRequestOptions extends SimpleStripeRequestBaseOptions {
  bodyEncoding: "json";
  body?: unknown;
}

export interface SimpleStripeRawRequestOptions extends SimpleStripeRequestBaseOptions {
  bodyEncoding: "raw";
  body?: any;
}

export type SimpleStripeRequestOptions =
  | SimpleStripeFormRequestOptions
  | SimpleStripeJsonRequestOptions
  | SimpleStripeRawRequestOptions;
