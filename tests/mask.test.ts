import { describe, expect, test } from "bun:test";
import { loadConfig } from "../src/config.ts";
import { collectSecrets, maskHeaders, maskHeaderValue, maskSecret, scrub } from "../src/mask.ts";
import { limitBody } from "../src/truncate.ts";

describe("maskSecret / maskHeaderValue", () => {
  test("long secrets keep their last 4 characters, short ones are fully masked", () => {
    expect(maskSecret("abcdefghijklmnop")).toBe("****mnop");
    expect(maskSecret("short-key")).toBe("****");
  });

  test("keeps the auth scheme", () => {
    expect(maskHeaderValue("Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig")).toBe("Bearer ****.sig");
    expect(maskHeaderValue("Token abcdefghijklmnop")).toBe("Token ****mnop");
  });

  test("Basic credentials are fully masked", () => {
    expect(maskHeaderValue(`Basic ${btoa("user:a-very-long-password")}`)).toBe("Basic ****");
  });

  test("maskHeaders only touches credential headers", () => {
    const config = loadConfig({ BASE_URL: "https://a.b", AUTH_APIKEY_HEADER_NAME: "X-Custom-Key", AUTH_APIKEY_VALUE: "abcdefghijklmnop" });
    expect(
      maskHeaders({ "x-custom-key": "abcdefghijklmnop", Cookie: "session=abcdefghijklmnop", Accept: "application/json" }, config),
    ).toEqual({ "x-custom-key": "****mnop", Cookie: "****mnop", Accept: "application/json" });
  });
});

describe("collectSecrets / scrub", () => {
  test("covers configured auth, proxy password and sent credential headers", () => {
    const config = loadConfig({
      BASE_URL: "https://a.b",
      AUTH_BASIC_USERNAME: "alice",
      AUTH_BASIC_PASSWORD: "wonderland!",
      AUTH_APIKEY_HEADER_NAME: "X-Key",
      AUTH_APIKEY_VALUE: "key-1234567890",
      PROXY_URL: "socks5://bob:proxy%20secret@127.0.0.1:1080",
    });
    const secrets = collectSecrets(config, { "X-Auth-Token": "Token per-request-token" });
    const text = [
      btoa("alice:wonderland!"),
      "alice:wonderland!",
      "pw=wonderland!",
      "pw=wonderland%21",
      "key-1234567890",
      "proxy secret",
      "per-request-token",
    ].join(" ");
    const scrubbed = scrub(text, secrets);
    for (const leaked of ["wonderland", "key-1234567890", "proxy secret", "per-request-token", btoa("alice:wonderland!")]) {
      expect(scrubbed).not.toContain(leaked);
    }
    expect(scrubbed).toContain("****7890");
  });

  test("short secrets are not scrubbed from bodies", () => {
    const config = loadConfig({ BASE_URL: "https://a.b", AUTH_BEARER: "abc" });
    expect(scrub("abc abcdef", collectSecrets(config))).toBe("abc abcdef");
  });

  test("scrubbing happens before truncation", () => {
    const secrets = [{ value: "SECRETSECRET", mask: "****" }];
    const bytes = new TextEncoder().encode("aaaa" + "SECRETSECRET" + "bbbb");
    const result = limitBody(bytes, bytes.length, 8, true, (t) => scrub(t, secrets));
    expect(result.body).toBe("aaaa****");
    expect(result.truncation?.originalSize).toBe(20);
  });
});
