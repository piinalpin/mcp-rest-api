import { describe, expect, test } from "bun:test";
import { loadConfig } from "../src/config.ts";
import { buildRequestHeaders, mergeHeaders, parseCustomHeaders } from "../src/headers.ts";

describe("parseCustomHeaders", () => {
  test("prefix is case-insensitive and header name case is preserved", () => {
    expect(
      parseCustomHeaders({
        HEADER_X_Api_Version: "2",
        header_Accept: "application/json",
        HeAdEr_X_Trace_ID: "abc",
        "HEADER_X-Client-Name": "mcp",
        HEADERS_NOT: "ignored",
        HEADER_: "ignored",
        PATH: "/usr/bin",
      }),
    ).toEqual({
      X_Api_Version: "2",
      Accept: "application/json",
      X_Trace_ID: "abc",
      "X-Client-Name": "mcp",
    });
  });
});

describe("mergeHeaders", () => {
  test("later layers win, case-insensitively, with their casing", () => {
    expect(mergeHeaders({ "x-token": "a", Accept: "*/*" }, { "X-TOKEN": "b" }, undefined, { "X-Token": "c" })).toEqual({
      "X-Token": "c",
      Accept: "*/*",
    });
  });
});

describe("buildRequestHeaders priority: per-request > auth > custom", () => {
  const config = loadConfig({
    BASE_URL: "https://api.example.com",
    HEADER_authorization: "Custom from-env",
    "HEADER_X-API-Key": "env-key",
    HEADER_Accept: "text/plain",
    AUTH_BEARER: "tok",
    AUTH_APIKEY_HEADER_NAME: "x-api-key",
    AUTH_APIKEY_VALUE: "auth-key",
  });

  test("auth overrides custom headers", () => {
    expect(buildRequestHeaders(config)).toEqual({
      Authorization: "Bearer tok",
      "x-api-key": "auth-key",
      Accept: "text/plain",
    });
  });

  test("per-request overrides auth and custom", () => {
    expect(buildRequestHeaders(config, { AUTHORIZATION: "Bearer other", accept: "application/json" })).toEqual({
      AUTHORIZATION: "Bearer other",
      "x-api-key": "auth-key",
      accept: "application/json",
    });
  });

  test("basic auth header", () => {
    const basic = loadConfig({ BASE_URL: "https://a.b", AUTH_BASIC_USERNAME: "user", AUTH_BASIC_PASSWORD: "p:ss" });
    expect(buildRequestHeaders(basic).Authorization).toBe(`Basic ${btoa("user:p:ss")}`);
  });
});
