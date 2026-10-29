import type { Config } from "./config.ts";

export type Headers = Record<string, string>;

const HEADER_PREFIX = /^header_/i;

/**
 * Collect global headers from HEADER_* env vars.
 * Prefix is case-insensitive (HEADER_, header_, HeAdEr_); the rest of the
 * variable name is used verbatim as the header name, case preserved.
 */
export function parseCustomHeaders(env: Record<string, string | undefined>): Headers {
  const layer: Headers = {};
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined || !HEADER_PREFIX.test(key)) continue;
    const name = key.slice("header_".length);
    if (name !== "") layer[name] = value;
  }
  return mergeHeaders(layer);
}

export function authHeaders(config: Pick<Config, "auth" | "apiKey">): Headers {
  const headers: Headers = {};
  if (config.auth.type === "basic") {
    const credentials = Buffer.from(`${config.auth.username}:${config.auth.password}`).toString("base64");
    headers.Authorization = `Basic ${credentials}`;
  } else if (config.auth.type === "bearer") {
    headers.Authorization = `Bearer ${config.auth.token}`;
  }
  if (config.apiKey) headers[config.apiKey.headerName] = config.apiKey.value;
  return headers;
}

/**
 * Merge header layers, lowest priority first. Names compare case-insensitively;
 * a later layer replaces the value and its spelling of the name wins.
 */
export function mergeHeaders(...layers: Array<Headers | undefined>): Headers {
  const merged = new Map<string, [string, string]>();
  for (const layer of layers) {
    if (!layer) continue;
    for (const [name, value] of Object.entries(layer)) merged.set(name.toLowerCase(), [name, value]);
  }
  return Object.fromEntries(merged.values());
}

/** Final request headers: per-request > auth > custom (HEADER_*). */
export function buildRequestHeaders(config: Config, perRequest?: Headers): Headers {
  return mergeHeaders(config.customHeaders, authHeaders(config), perRequest);
}

export function hasHeader(headers: Headers, name: string): boolean {
  const lower = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === lower);
}
