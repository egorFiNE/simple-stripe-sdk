import { setTimeout } from "node:timers/promises";
import { RETRY_BASE_DELAY_MS } from "./constants.js";
import type { SimpleStripeError, SimpleStripeFailure } from "./types.js";

function isMethodRetryable(method1?: string, headers?: HeadersInit): boolean {
  const method = (method1 ?? "GET").toUpperCase();

  if (method === "GET" || method === "DELETE") {
    return true;
  }

  // Retrying mutating requests without an idempotency key is a footgun.
  // We keep the SDK conservative here so retries help more often than they hurt.

  return headers ? new Headers(headers).has("Idempotency-Key") : false;
}

export function shouldRetryResponse(response: Response, method?: string, headers?: HeadersInit): boolean {
  if (!isMethodRetryable(method, headers)) {
    return false;
  }

  return response.status === 409 || response.status === 429 || response.status >= 500;
}

export function shouldRetryError(error: SimpleStripeError, method?: string, headers?: HeadersInit): boolean {
  if (!isMethodRetryable(method, headers)) {
    return false;
  }

  return error.kind === "timeout" || error.kind === "fetch";
}

function parseRetryAfterHeader(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const seconds = Number(value);

  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1_000);
  }

  const targetTimestamp = Date.parse(value);

  if (Number.isNaN(targetTimestamp)) {
    return null;
  }

  return Math.max(0, targetTimestamp - Date.now());
}

export function computeRetryDelayMs(response: Response): number {
  return parseRetryAfterHeader(response.headers.get("Retry-After")) ?? RETRY_BASE_DELAY_MS;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function isStripeErrorPayload(value: unknown): boolean {
  if (typeof value !== "object" || value === null || !("error" in value)) {
    return false;
  }

  return typeof value.error === "object" && value.error !== null;
}

export async function sleepMs(delayMs: number): Promise<void> {
  await setTimeout(delayMs);
}

export async function jsonParseWithCatch(response: Response): Promise<any> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function errorToString(error: SimpleStripeError): string {
  if (error.kind === "stripe") {
    return `Stripe error: ${error.message} (type: ${error.type}, code: ${error.code}, HTTP status: ${error.status})`;
  }

  if (error.kind === "fetch") {
    return `Fetch error: ${error.message}`;
  }

  if (error.kind === "timeout") {
    return `Request timed out`;
  }

  if (error.kind === "decode") {
    return error.message;
  }

  if (error.kind === "http") {
    return `HTTP error: ${error.message} (HTTP status: ${error.status})`;
  }

  if (error.kind === "validation") {
    return `Validation error: ${error.message}`;
  }

  return `Unknown error: ${error.message}`;
}

export function validateLimitAndPossiblyReturnFailure(limit?: number): SimpleStripeFailure | null {
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 0)) {
    return {
      ok: false,
      error: {
        kind: "validation",
        message: "Limit must be a non-negative integer."
      }
    };
  }

  return null;
}

export function appendTotalCountToSearchParamsExpand(expand?: unknown): string[] {
  const values: string[] = [];

  if (Array.isArray(expand)) {
    for (const value of expand) { // eslint-disable-line no-restricted-syntax
      values.push(value);
    }

  } else if (typeof expand === "string" && expand.length > 0) {
    values.push(expand);
  }

  if (!values.includes("total_count")) {
    values.push("total_count");
  }

  return values;
}
