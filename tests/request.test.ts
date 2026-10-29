import { afterAll, describe, expect, test } from "bun:test";
import { HttpError } from "../src/http.ts";
import { errorResult, METHODS, performRequest, ToolInputError } from "../src/tool.ts";
import { makeConfig, startEchoServer } from "./helpers.ts";

const server = startEchoServer();
afterAll(() => server.stop(true));

const baseEnv = () => ({ BASE_URL: `http://127.0.0.1:${server.port}/api` });

describe("performRequest", () => {
  const config = makeConfig({
    ...baseEnv(),
    AUTH_BEARER: "secret-token",
    HEADER_X_Global: "global",
    "header_X-Override": "from-env",
  });

  for (const method of METHODS) {
    test(`${method} request`, async () => {
      const report = await performRequest(config, { method, endpoint: "/items?x=1" });
      expect(report.response.statusCode).toBe(200);
      expect(report.request.url).toBe(`http://127.0.0.1:${server.port}/api/items?x=1`);
      if (method === "HEAD") {
        expect(report.response.body).toBe("");
      } else {
        const echo = JSON.parse(report.response.body);
        expect(echo.method).toBe(method);
        expect(echo.path).toBe("/api/items");
        expect(echo.query).toBe("?x=1");
      }
    });
  }

  for (const method of ["POST", "PUT", "PATCH"] as const) {
    test(`${method} sends JSON body`, async () => {
      const report = await performRequest(config, { method, endpoint: "/items", body: { name: "widget", tags: ["a"] } });
      const echo = JSON.parse(report.response.body);
      expect(echo.body).toBe('{"name":"widget","tags":["a"]}');
      expect(echo.headers["content-type"]).toBe("application/json");
      expect(report.request.body).toBe('{"name":"widget","tags":["a"]}');
    });
  }

  test("string body is sent as-is with caller content type", async () => {
    const report = await performRequest(config, {
      method: "POST",
      endpoint: "/raw",
      body: "a=1&b=2",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    const echo = JSON.parse(report.response.body);
    expect(echo.body).toBe("a=1&b=2");
    expect(echo.headers["content-type"]).toBe("application/x-www-form-urlencoded");
  });

  test("body on GET is rejected", async () => {
    expect(performRequest(config, { method: "GET", endpoint: "/x", body: "nope" })).rejects.toBeInstanceOf(ToolInputError);
  });

  test("headers: global, auth and per-request override reach the server", async () => {
    const report = await performRequest(config, { method: "GET", endpoint: "/h", headers: { "X-OVERRIDE": "per-request" } });
    const echo = JSON.parse(report.response.body);
    expect(echo.headers["x_global"]).toBe("global");
    expect(echo.headers["x-override"]).toBe("per-request");
    expect(echo.headers.authorization).toBe("Bearer ****oken");
    expect(report.request.headers.Authorization).toBe("Bearer ****oken");
  });

  test("secrets echoed by the server are scrubbed from the result", async () => {
    const report = await performRequest(config, { method: "POST", endpoint: "/h", body: { token: "secret-token" } });
    expect(JSON.parse(report.response.body).headers.authorization).toBe("Bearer ****oken");
    expect(report.response.headers["x-seen-authorization"]).toBe("Bearer ****oken");
    expect(report.request.body).toBe('{"token":"****oken"}');
    expect(JSON.stringify(report)).not.toContain("secret-token");
  });

  test("per-request credentials are masked and scrubbed", async () => {
    const report = await performRequest(config, {
      method: "GET",
      endpoint: "/h",
      headers: { Authorization: "Basic " + btoa("alice:per-request-pw"), "X-API-Key": "per-request-api-key" },
    });
    expect(report.request.headers).toMatchObject({ Authorization: "Basic ****", "X-API-Key": "****-key" });
    const text = JSON.stringify(report);
    expect(text).not.toContain(btoa("alice:per-request-pw"));
    expect(text).not.toContain("per-request-api-key");
    expect(report.response.headers["x-seen-authorization"]).toBe("Basic ****");
  });

  test("a secret crossing the size limit is still scrubbed", async () => {
    const small = makeConfig({ ...baseEnv(), AUTH_BEARER: "secret-token-crossing-limit", RESPONSE_SIZE_LIMIT: "100" });
    const report = await performRequest(small, { method: "GET", endpoint: "/padded-echo?pad=80" });
    expect(report.response.body).toBe("x".repeat(80) + "Bearer ****imit" + "y".repeat(5));
    expect(report.response.body).not.toContain("secret");
    expect(report.truncation?.originalSize).toBe(80 + "Bearer secret-token-crossing-limit".length + 100);
  });

  test("binds path params and query params", async () => {
    const report = await performRequest(config, {
      method: "GET",
      endpoint: "/users/{userId}/posts/:postId?sort=asc",
      pathParams: { userId: 7, postId: "hello world" },
      queryParams: { sort: "desc", tag: ["a", "b"], unused: null },
    });
    const echo = JSON.parse(report.response.body);
    expect(echo.path).toBe("/api/users/7/posts/hello%20world");
    expect(echo.query).toBe("?sort=desc&tag=a&tag=b");
    expect(report.request.endpoint).toBe("/users/{userId}/posts/:postId?sort=asc");
    expect(report.request.url).toBe(`http://127.0.0.1:${server.port}/api/users/7/posts/hello%20world?sort=desc&tag=a&tag=b`);
  });

  test("warns about unused path params and fails on missing ones", async () => {
    const report = await performRequest(config, { method: "GET", endpoint: "/users/{id}", pathParams: { id: 1, typo: 2 } });
    expect(report.validation.messages).toContain("Unused pathParams (no matching placeholder in the endpoint): typo");
    const error = await performRequest(config, { method: "GET", endpoint: "/users/{id}" }).catch((e) => e);
    expect(errorResult(error, config).content[0]).toMatchObject({ text: expect.stringContaining('Missing value for path parameter(s): id') });
  });

  test("plain endpoints have no endpoint field in the report", async () => {
    const report = await performRequest(config, { method: "GET", endpoint: "/plain" });
    expect(report.request.endpoint).toBeUndefined();
  });

  test("response details: status, headers, timing", async () => {
    const report = await performRequest(config, { method: "GET", endpoint: "/h" });
    expect(report.response.statusText).toBe("OK");
    expect(report.response.headers["x-echo"]).toBe("yes");
    expect(report.response.headers["content-type"]).toContain("application/json");
    expect(report.response.timing).toMatch(/^\d+\.\dms$/);
    expect(report.validation).toEqual({ isError: false, messages: ["Request completed successfully"] });
    expect(report.truncation).toBeUndefined();
  });

  test("4xx is reported, not thrown", async () => {
    const report = await performRequest(config, { method: "GET", endpoint: "/missing" });
    expect(report.response.statusCode).toBe(404);
    expect(report.validation.isError).toBe(true);
    expect(JSON.parse(report.response.body)).toEqual({ error: "not found" });
  });

  test("truncates large bodies at default 10000 bytes, keeping the envelope", async () => {
    const report = await performRequest(config, { method: "GET", endpoint: "/big?size=50000" });
    expect(report.response.body.length).toBe(10_000);
    expect(report.response.statusCode).toBe(200);
    expect(report.response.headers["content-type"]).toContain("text/plain");
    expect(report.truncation).toMatchObject({ originalSize: 50_000, returnedSize: 10_000, sizeLimit: 10_000 });
    expect(report.validation.messages[1]).toContain("truncated");
  });

  test("RESPONSE_SIZE_LIMIT changes the limit", async () => {
    const small = makeConfig({ ...baseEnv(), RESPONSE_SIZE_LIMIT: "100" });
    const report = await performRequest(small, { method: "GET", endpoint: "/big?size=1000" });
    expect(report.response.body.length).toBe(100);
    expect(report.truncation?.originalSize).toBe(1000);
  });

  test("rejects endpoints outside BASE_URL", async () => {
    const result = errorResult(await performRequest(config, { method: "GET", endpoint: "http://evil.com/" }).catch((e) => e), config);
    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({ type: "text" });
  });

  test("timeout", async () => {
    const quick = makeConfig({ ...baseEnv(), TIMEOUT_MS: "100" });
    const error = await performRequest(quick, { method: "GET", endpoint: "/slow" }).catch((e) => e);
    expect(error).toBeInstanceOf(HttpError);
    expect(error.code).toBe("ETIMEDOUT");
  });

  test("connection refused", async () => {
    const dead = makeConfig({ BASE_URL: "http://127.0.0.1:1" });
    const error = await performRequest(dead, { method: "GET", endpoint: "/" }).catch((e) => e);
    expect(error).toBeInstanceOf(HttpError);
  });
});
