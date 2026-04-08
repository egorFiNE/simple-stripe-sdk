interface KeyValuePair {
  key: string;
  value: string;
}

function isScalar(value: unknown): value is string | number | boolean | null {
  return value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function appendPairs(pairs: KeyValuePair[], key: string, value: unknown): void {
  // `undefined` is treated as "not provided" so callers can build request objects
  // without manually deleting optional fields first.
  if (value === undefined) {
    return;
  }

  // Stripe endpoints often use empty strings and explicit null-ish values to mean
  // something real, so we only skip `undefined`. `null` is serialized intentionally.
  if (isScalar(value)) {
    pairs.push({
      key,
      value: value === null ? "" : String(value),
    });

    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      // Arrays of simple values are most ergonomic when encoded as `field[]=a&field[]=b`.
      // Arrays of objects need indexes so nested fields keep a stable shape.
      const nextKey = isScalar(item) ? `${key}[]` : `${key}[${index}]`;
      appendPairs(pairs, nextKey, item);
    });

    return;
  }

  Object.entries(value).forEach(([childKey, childValue]) => appendPairs(pairs, `${key}[${childKey}]`, childValue));
}

export function toStripeSearchParams(input: Record<string, unknown>): URLSearchParams {
  const pairs: KeyValuePair[] = [];

  Object.entries(input).forEach(([key, value]) => appendPairs(pairs, key, value));

  const params = new URLSearchParams();

  for (const pair of pairs) {
    params.append(pair.key, pair.value);
  }

  return params;
}
