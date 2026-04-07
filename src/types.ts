export interface StripeSuccess<T> {
  ok: true;
  data: T;
  meta: {
    status: number;
    headers: Headers;
  };
}

export interface StripeTimeoutError {
  kind: "timeout";
}

export interface StripeFetchError {
  kind: "fetch";
  message: string;
}

export interface StripeApiError {
  kind: "stripe";
  message: string;
  code?: string;
  type?: string;
  status: number;
  raw: any;
}

export interface StripeHttpError {
  kind: "http";
  message: string;
  status: number;
  body?: any;
}

export interface StripeDecodeError {
  kind: "decode";
  message: string;
  status: number;
}

export type StripeError =
  | StripeTimeoutError
  | StripeFetchError
  | StripeApiError
  | StripeHttpError
  | StripeDecodeError;

export interface StripeFailure {
  ok: false;
  error: StripeError;
}

export type StripeResult<T> = StripeSuccess<T> | StripeFailure;

export interface StripeRequestBaseOptions {
  params?: Record<string, any>;
  headers?: Record<string, string>;
}

export interface StripeFormRequestOptions extends StripeRequestBaseOptions {
  bodyEncoding?: "form";
  body?: Record<string, any>; // FIXME lessen detection on body
}

export interface StripeJsonRequestOptions extends StripeRequestBaseOptions {
  bodyEncoding: "json";
  body?: unknown;
}

export interface StripeRawRequestOptions extends StripeRequestBaseOptions {
  bodyEncoding: "raw";
  body?: any;
}

export type StripeRequestOptions =
  | StripeFormRequestOptions
  | StripeJsonRequestOptions
  | StripeRawRequestOptions;
