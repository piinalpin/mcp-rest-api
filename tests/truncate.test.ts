import { describe, expect, test } from "bun:test";
import { limitBody, utf8SafeCut } from "../src/truncate.ts";

const enc = (s: string) => new TextEncoder().encode(s);

describe("limitBody", () => {
  test("returns small bodies unchanged", () => {
    expect(limitBody(enc("hello"), 5, 10)).toEqual({ body: "hello" });
  });

  test("truncates large bodies with metadata", () => {
    const result = limitBody(enc("a".repeat(100)), 100, 10);
    expect(result.body).toBe("a".repeat(10));
    expect(result.truncation).toMatchObject({ originalSize: 100, returnedSize: 10, truncationPoint: 10, sizeLimit: 10, originalSizeExact: true });
  });

  test("handles a kept prefix of a larger body", () => {
    const result = limitBody(enc("a".repeat(10)), 5000, 10, false);
    expect(result.truncation?.originalSize).toBe(5000);
    expect(result.truncation?.message).toContain("more than 5000");
  });

  test("never splits a multi-byte character", () => {
    const bytes = enc("aé€"); // 1 + 2 + 3 bytes
    expect(utf8SafeCut(bytes, 2)).toBe(1);
    expect(utf8SafeCut(bytes, 4)).toBe(3);
    expect(limitBody(bytes, bytes.length, 5).body).toBe("aé");
  });
});
