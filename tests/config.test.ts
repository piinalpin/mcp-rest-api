import { describe, expect, test } from "bun:test";
import { ConfigError, DEFAULT_RESPONSE_SIZE_LIMIT, describeConfig, loadConfig } from "../src/config.ts";

const base = { BASE_URL: "https://api.example.com/v1" };

describe("loadConfig", () => {
  test("applies defaults", () => {
    const config = loadConfig(base);
    expect(config.baseUrl.href).toBe("https://api.example.com/v1");
    expect(config.responseSizeLimit).toBe(DEFAULT_RESPONSE_SIZE_LIMIT);
    expect(config.responseSizeLimit).toBe(10_000);
    expect(config.sslVerify).toBe(true);
    expect(config.auth).toEqual({ type: "none" });
    expect(config.apiKey).toBeUndefined();
    expect(config.proxyUrl).toBeUndefined();
  });

  test("requires a valid http(s) BASE_URL", () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
    expect(() => loadConfig({ BASE_URL: "not a url" })).toThrow(ConfigError);
    expect(() => loadConfig({ BASE_URL: "ftp://example.com" })).toThrow(ConfigError);
  });

  test("RESPONSE_SIZE_LIMIT must be a positive integer", () => {
    expect(loadConfig({ ...base, RESPONSE_SIZE_LIMIT: "2048" }).responseSizeLimit).toBe(2048);
    for (const bad of ["0", "-5", "1.5", "abc"]) {
      expect(() => loadConfig({ ...base, RESPONSE_SIZE_LIMIT: bad })).toThrow(ConfigError);
    }
  });

  test("ENABLE_SSL_VERIFY parsing", () => {
    for (const off of ["false", "FALSE", "0", "no", "off"]) {
      expect(loadConfig({ ...base, ENABLE_SSL_VERIFY: off }).sslVerify).toBe(false);
    }
    for (const on of ["true", "1", "yes", ""]) {
      expect(loadConfig({ ...base, ENABLE_SSL_VERIFY: on }).sslVerify).toBe(true);
    }
    expect(() => loadConfig({ ...base, ENABLE_SSL_VERIFY: "maybe" })).toThrow(ConfigError);
  });

  test("auth methods", () => {
    expect(loadConfig({ ...base, AUTH_BASIC_USERNAME: "u", AUTH_BASIC_PASSWORD: "p" }).auth).toEqual({ type: "basic", username: "u", password: "p" });
    expect(loadConfig({ ...base, AUTH_BEARER: "tok" }).auth).toEqual({ type: "bearer", token: "tok" });
    expect(loadConfig({ ...base, AUTH_APIKEY_HEADER_NAME: "X-API-Key", AUTH_APIKEY_VALUE: "k" }).apiKey).toEqual({ headerName: "X-API-Key", value: "k" });
  });

  test("rejects conflicting or partial auth", () => {
    expect(() => loadConfig({ ...base, AUTH_BASIC_USERNAME: "u", AUTH_BASIC_PASSWORD: "p", AUTH_BEARER: "t" })).toThrow(/only one/);
    expect(() => loadConfig({ ...base, AUTH_BASIC_USERNAME: "u" })).toThrow(ConfigError);
    expect(() => loadConfig({ ...base, AUTH_BASIC_PASSWORD: "p" })).toThrow(ConfigError);
    expect(() => loadConfig({ ...base, AUTH_APIKEY_HEADER_NAME: "X-Key" })).toThrow(ConfigError);
    expect(() => loadConfig({ ...base, AUTH_APIKEY_VALUE: "v" })).toThrow(ConfigError);
  });

  test("proxy settings", () => {
    const config = loadConfig({ ...base, PROXY_URL: "socks5h://user:pw@127.0.0.1:1080", NO_PROXY: "localhost, .internal ,," });
    expect(config.proxyUrl?.protocol).toBe("socks5h:");
    expect(config.noProxy).toEqual(["localhost", ".internal"]);
    expect(() => loadConfig({ ...base, PROXY_URL: "ftp://proxy:21" })).toThrow(ConfigError);
  });

  test("describeConfig hides secrets", () => {
    const text = describeConfig(
      loadConfig({ ...base, AUTH_BEARER: "secret-token", AUTH_APIKEY_HEADER_NAME: "X-Key", AUTH_APIKEY_VALUE: "secret-key", PROXY_URL: "socks5://user:secret-pw@proxy:1080" }),
    );
    expect(text).not.toContain("secret");
    expect(text).toContain("bearer + api-key (X-Key)");
    expect(text).toContain("socks5://proxy:1080");
  });
});
