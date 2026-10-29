import { describe, expect, test } from "bun:test";
import { buildUrl, EndpointError } from "../src/url.ts";

describe("buildUrl", () => {
  const base = new URL("https://api.example.com/v1/");

  test("joins base path and endpoint", () => {
    expect(buildUrl(base, "/users").href).toBe("https://api.example.com/v1/users");
    expect(buildUrl(base, "/users?page=2&q=a%20b").href).toBe("https://api.example.com/v1/users?page=2&q=a%20b");
    expect(buildUrl(new URL("https://api.example.com"), "/").href).toBe("https://api.example.com/");
  });

  test("keeps base query params unless overridden", () => {
    const withKey = new URL("https://api.example.com/v1?api_key=k&fmt=json");
    expect(buildUrl(withKey, "/items?fmt=xml").href).toBe("https://api.example.com/v1/items?fmt=xml&api_key=k");
  });

  test("rejects absolute, scheme-relative and escaping endpoints", () => {
    for (const bad of ["https://evil.com/x", "users", "//evil.com/x", "/\\evil.com", "/../admin", "/users/../../admin"]) {
      expect(() => buildUrl(base, bad)).toThrow(EndpointError);
    }
  });
});
