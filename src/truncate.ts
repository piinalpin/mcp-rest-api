export interface TruncationInfo {
  originalSize: number;
  /** False when the body was larger than the read cap and its full size is unknown. */
  originalSizeExact: boolean;
  returnedSize: number;
  truncationPoint: number;
  sizeLimit: number;
  message: string;
}

export interface BodyResult {
  body: string;
  truncation?: TruncationInfo;
}

/** Largest cut <= limit that does not split a UTF-8 multi-byte sequence. */
export function utf8SafeCut(bytes: Uint8Array, limit: number): number {
  if (bytes.length <= limit) return bytes.length;
  let cut = limit;
  // 0b10xxxxxx bytes continue a sequence; step back to a sequence start.
  while (cut > 0 && ((bytes[cut] ?? 0) & 0xc0) === 0x80) cut--;
  return cut;
}

/** Length of `bytes` without a trailing, incomplete UTF-8 sequence. */
export function completeUtf8Length(bytes: Uint8Array): number {
  for (let i = bytes.length - 1; i >= Math.max(0, bytes.length - 4); i--) {
    const byte = bytes[i] ?? 0;
    if ((byte & 0xc0) === 0x80) continue;
    const needed = byte >= 0xf0 ? 4 : byte >= 0xe0 ? 3 : byte >= 0xc0 ? 2 : 1;
    return i + needed <= bytes.length ? bytes.length : i;
  }
  return bytes.length;
}

/**
 * Decode a body as UTF-8, apply `transform` (secret scrubbing), then truncate
 * to `limit` bytes. `bytes` may hold only a prefix of the body; `totalSize` is
 * the full size.
 */
export function limitBody(
  bytes: Uint8Array,
  totalSize: number,
  limit: number,
  totalExact = true,
  transform: (text: string) => string = (text) => text,
): BodyResult {
  const complete = totalExact && bytes.length === totalSize;
  const text = transform(new TextDecoder().decode(complete ? bytes : bytes.subarray(0, completeUtf8Length(bytes))));
  const encoded = new TextEncoder().encode(text);
  if (complete && encoded.length <= limit) return { body: text };

  const cut = utf8SafeCut(encoded, limit);
  const sizeText = totalExact ? `${totalSize}` : `more than ${totalSize}`;
  return {
    body: new TextDecoder().decode(encoded.subarray(0, cut)),
    truncation: {
      originalSize: totalSize,
      originalSizeExact: totalExact,
      returnedSize: cut,
      truncationPoint: cut,
      sizeLimit: limit,
      message: `Response body truncated: returned ${cut} of ${sizeText} bytes (limit ${limit}). Set RESPONSE_SIZE_LIMIT to change the limit.`,
    },
  };
}
