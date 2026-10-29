import { afterAll, describe, expect, test } from "bun:test";
import { bypassesProxy } from "../src/proxy.ts";
import { performRequest } from "../src/tool.ts";
import { makeConfig, selfSignedCert, startEchoServer, startHttpProxy, startSocks5Server } from "./helpers.ts";

describe("bypassesProxy", () => {
  const target = new URL("https://api.internal.example.com:8443/x");
  test("matching rules", () => {
    expect(bypassesProxy(target, ["*"])).toBe(true);
    expect(bypassesProxy(target, ["example.com"])).toBe(true);
    expect(bypassesProxy(target, [".example.com"])).toBe(true);
    expect(bypassesProxy(target, ["*.example.com"])).toBe(true);
    expect(bypassesProxy(target, ["api.internal.example.com:8443"])).toBe(true);
    expect(bypassesProxy(target, ["api.internal.example.com:443"])).toBe(false);
    expect(bypassesProxy(target, ["ample.com", "other.org"])).toBe(false);
    expect(bypassesProxy(new URL("http://[::1]:80/"), ["::1"])).toBe(true);
    expect(bypassesProxy(new URL("http://localhost/"), ["localhost:80"])).toBe(true);
  });
});

const echo = startEchoServer();
const socks = await startSocks5Server();
const httpProxy = await startHttpProxy();
const cert = selfSignedCert();
const tlsEcho = cert ? startEchoServer(cert) : undefined;

afterAll(() => {
  echo.stop(true);
  tlsEcho?.stop(true);
  socks.close();
  httpProxy.close();
});

describe("proxy routing", () => {
  test("SOCKS5 proxy", async () => {
    const config = makeConfig({ BASE_URL: `http://127.0.0.1:${echo.port}`, PROXY_URL: `socks5://127.0.0.1:${socks.port}` });
    const report = await performRequest(config, { method: "POST", endpoint: "/via-socks", body: { a: 1 } });
    expect(report.response.statusCode).toBe(200);
    expect(JSON.parse(report.response.body).body).toBe('{"a":1}');
    expect(socks.targets).toContain(`127.0.0.1:${echo.port}`);
  });

  test("SOCKS5h proxy resolves hostname remotely", async () => {
    const config = makeConfig({ BASE_URL: `http://localhost:${echo.port}`, PROXY_URL: `socks5h://127.0.0.1:${socks.port}` });
    const report = await performRequest(config, { method: "GET", endpoint: "/via-socks5h" });
    expect(report.response.statusCode).toBe(200);
    expect(socks.targets).toContain(`localhost:${echo.port}`);
  });

  test("HTTP proxy forwards http targets", async () => {
    const config = makeConfig({ BASE_URL: `http://127.0.0.1:${echo.port}`, PROXY_URL: `http://127.0.0.1:${httpProxy.port}` });
    const report = await performRequest(config, { method: "GET", endpoint: "/via-http-proxy" });
    expect(report.response.statusCode).toBe(200);
    expect(httpProxy.seen).toContain(`GET http://127.0.0.1:${echo.port}/via-http-proxy`);
  });

  test("NO_PROXY bypasses the proxy", async () => {
    const before = socks.targets.length;
    const config = makeConfig({ BASE_URL: `http://127.0.0.1:${echo.port}`, PROXY_URL: `socks5://127.0.0.1:${socks.port}`, NO_PROXY: "127.0.0.1" });
    const report = await performRequest(config, { method: "GET", endpoint: "/direct" });
    expect(report.response.statusCode).toBe(200);
    expect(socks.targets.length).toBe(before);
  });
});

describe.skipIf(!tlsEcho)("SSL verification", () => {
  const baseUrl = () => `https://127.0.0.1:${tlsEcho!.port}`;

  test("self-signed certificate fails when verification is enabled", async () => {
    const config = makeConfig({ BASE_URL: baseUrl() });
    const error = await performRequest(config, { method: "GET", endpoint: "/" }).catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBeDefined();
  });

  test("ENABLE_SSL_VERIFY=false accepts self-signed certificate", async () => {
    const config = makeConfig({ BASE_URL: baseUrl(), ENABLE_SSL_VERIFY: "false" });
    const report = await performRequest(config, { method: "GET", endpoint: "/" });
    expect(report.response.statusCode).toBe(200);
  });

  test("ENABLE_SSL_VERIFY=false through SOCKS5", async () => {
    const config = makeConfig({ BASE_URL: baseUrl(), ENABLE_SSL_VERIFY: "false", PROXY_URL: `socks5://127.0.0.1:${socks.port}` });
    const report = await performRequest(config, { method: "GET", endpoint: "/tls-socks" });
    expect(report.response.statusCode).toBe(200);
  });

  test("HTTPS target through HTTP CONNECT proxy", async () => {
    const config = makeConfig({ BASE_URL: baseUrl(), ENABLE_SSL_VERIFY: "false", PROXY_URL: `http://127.0.0.1:${httpProxy.port}` });
    const report = await performRequest(config, { method: "GET", endpoint: "/tls-connect" });
    expect(report.response.statusCode).toBe(200);
    expect(httpProxy.seen).toContain(`CONNECT 127.0.0.1:${tlsEcho!.port}`);
  });
});
