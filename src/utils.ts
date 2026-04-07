import type { StripeError } from "./types.js";
import { RETRY_BASE_DELAY_MS } from "./constants.js";

export function shouldRetryResponse(response: Response, method?: string, headers?: HeadersInit): boolean {
  if (!isMethodRetryable(method, headers)) {
    return false;
  }

  return response.status === 409 || response.status === 429 || response.status >= 500;
}

export function shouldRetryError(error: StripeError, method?: string, headers?: HeadersInit): boolean {
  if (!isMethodRetryable(method, headers)) {
    return false;
  }

  return error.kind === "timeout" || error.kind === "fetch";
}

function isMethodRetryable(method1?: string, headers?: HeadersInit): boolean {
  const method = (method1 ?? "GET").toUpperCase();

  if (method === "GET" || method === "DELETE") {
    return true;
  }

  // Retrying mutating requests without an idempotency key is a footgun.
  // We keep the SDK conservative here so retries help more often than they hurt.
  // @ts-expect-error FIXME
  return headers ? headers["Idempotency-Key"] !== undefined : false;
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

export function sleepMs(delayMs: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, delayMs));
}

export async function jsonParseOrThrow(response: Response): Promise<any> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
