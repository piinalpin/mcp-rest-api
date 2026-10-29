import { parseCustomHeaders } from "./headers.ts";
import { describeProxy } from "./proxy.ts";

export const DEFAULT_RESPONSE_SIZE_LIMIT = 10_000;
export const DEFAULT_TIMEOUT_MS = 30_000;

export type Auth =
  | { type: "none" }
  | { type: "basic"; username: string; password: string }
  | { type: "bearer"; token: string };

export interface ApiKey {
  headerName: string;
  value: string;
}

export interface Config {
  baseUrl: URL;
  /** Global headers from HEADER_* env vars, header-name case preserved. */
  customHeaders: Record<string, string>;
  auth: Auth;
  apiKey?: ApiKey;
  responseSizeLimit: number;
  sslVerify: boolean;
  proxyUrl?: URL;
  noProxy: string[];
  timeoutMs: number;
}

export class ConfigError extends Error {
  override name = "ConfigError";
}

type Env = Record<string, string | undefined>;

const PROXY_PROTOCOLS = new Set(["socks:", "socks4:", "socks4a:", "socks5:", "socks5h:", "http:", "https:"]);
const HEADER_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

function nonEmpty(value: string | undefined): string | undefined {
  return value === undefined || value === "" ? undefined : value;
}

function parsePositiveInt(name: string, raw: string | undefined, fallback: number): number {
  const value = nonEmpty(raw?.trim());
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value) || Number(value) <= 0) {
    throw new ConfigError(`${name} must be a positive integer, got "${raw}"`);
  }
  return Number(value);
}

export function parseBoolean(name: string, raw: string | undefined, fallback: boolean): boolean {
  const value = nonEmpty(raw?.trim().toLowerCase());
  if (value === undefined) return fallback;
  if (["true", "1", "yes", "on"].includes(value)) return true;
  if (["false", "0", "no", "off"].includes(value)) return false;
  throw new ConfigError(`${name} must be true or false, got "${raw}"`);
}

function parseBaseUrl(raw: string | undefined): URL {
  const value = nonEmpty(raw?.trim());
  if (value === undefined) throw new ConfigError("BASE_URL is required (e.g. https://api.example.com/v1)");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConfigError(`BASE_URL is not a valid URL: "${value}"`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ConfigError(`BASE_URL must use http or https, got "${url.protocol}"`);
  }
  if (url.hash) throw new ConfigError("BASE_URL must not contain a #fragment");
  return url;
}

function parseAuth(env: Env): Auth {
  const username = nonEmpty(env.AUTH_BASIC_USERNAME);
  const password = env.AUTH_BASIC_PASSWORD;
  const token = nonEmpty(env.AUTH_BEARER);

  if (username !== undefined && token !== undefined) {
    throw new ConfigError("Set only one of Basic auth (AUTH_BASIC_*) or Bearer auth (AUTH_BEARER): both use the Authorization header");
  }
  if (username !== undefined) {
    if (password === undefined) throw new ConfigError("AUTH_BASIC_PASSWORD is required when AUTH_BASIC_USERNAME is set");
    return { type: "basic", username, password };
  }
  if (password !== undefined) throw new ConfigError("AUTH_BASIC_USERNAME is required when AUTH_BASIC_PASSWORD is set");
  if (token !== undefined) return { type: "bearer", token };
  return { type: "none" };
}

function parseApiKey(env: Env): ApiKey | undefined {
  const headerName = nonEmpty(env.AUTH_APIKEY_HEADER_NAME?.trim());
  const value = nonEmpty(env.AUTH_APIKEY_VALUE);
  if (headerName === undefined && value === undefined) return undefined;
  if (headerName === undefined) throw new ConfigError("AUTH_APIKEY_HEADER_NAME is required when AUTH_APIKEY_VALUE is set");
  if (value === undefined) throw new ConfigError("AUTH_APIKEY_VALUE is required when AUTH_APIKEY_HEADER_NAME is set");
  if (!HEADER_NAME.test(headerName)) throw new ConfigError(`AUTH_APIKEY_HEADER_NAME is not a valid header name: "${headerName}"`);
  return { headerName, value };
}

function parseProxyUrl(raw: string | undefined): URL | undefined {
  const value = nonEmpty(raw?.trim());
  if (value === undefined) return undefined;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConfigError(`PROXY_URL is not a valid URL: "${value}"`);
  }
  if (!PROXY_PROTOCOLS.has(url.protocol)) {
    throw new ConfigError(`PROXY_URL protocol "${url.protocol}" not supported (use socks5, socks5h, socks4, socks4a, http or https)`);
  }
  return url;
}

function parseNoProxy(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry !== "");
}

export function loadConfig(env: Env = process.env): Config {
  const customHeaders = parseCustomHeaders(env);
  for (const name of Object.keys(customHeaders)) {
    if (!HEADER_NAME.test(name)) throw new ConfigError(`Invalid header name from HEADER_* variable: "${name}"`);
  }

  return Object.freeze({
    baseUrl: parseBaseUrl(env.BASE_URL),
    customHeaders,
    auth: parseAuth(env),
    apiKey: parseApiKey(env),
    responseSizeLimit: parsePositiveInt("RESPONSE_SIZE_LIMIT", env.RESPONSE_SIZE_LIMIT, DEFAULT_RESPONSE_SIZE_LIMIT),
    sslVerify: parseBoolean("ENABLE_SSL_VERIFY", env.ENABLE_SSL_VERIFY, true),
    proxyUrl: parseProxyUrl(env.PROXY_URL),
    noProxy: parseNoProxy(env.NO_PROXY),
    timeoutMs: parsePositiveInt("TIMEOUT_MS", env.TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
  });
}

/** Safe-to-show summary of the config (no secrets). */
export function describeConfig(config: Config): string {
  const auth = [config.auth.type === "none" ? undefined : config.auth.type, config.apiKey ? `api-key (${config.apiKey.headerName})` : undefined]
    .filter(Boolean)
    .join(" + ");
  return [
    `Base URL: ${config.baseUrl.href}`,
    `Auth: ${auth || "none"}`,
    `Custom headers: ${Object.keys(config.customHeaders).join(", ") || "none"}`,
    `Response size limit: ${config.responseSizeLimit} bytes`,
    `SSL verification: ${config.sslVerify ? "enabled" : "DISABLED"}`,
    `Proxy: ${describeProxy(config.proxyUrl) ?? "none"}${config.noProxy.length ? ` (NO_PROXY: ${config.noProxy.join(",")})` : ""}`,
    `Timeout: ${config.timeoutMs}ms`,
  ].join("\n");
}
