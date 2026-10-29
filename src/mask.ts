import type { Config } from "./config.ts";
import type { Headers } from "./headers.ts";

/** Header names whose values are credentials, besides the configured API key header. */
const SENSITIVE_HEADERS = new Set(["authorization", "proxy-authorization", "cookie", "x-api-key", "api-key", "apikey", "x-auth-token"]);

/** Secrets shorter than this are masked in headers but not searched for in bodies. */
export const MIN_SCRUB_LENGTH = 6;
/** Secrets shorter than this are masked fully; longer ones keep their last 4 characters. */
const MIN_PARTIAL_LENGTH = 12;
const MASK = "****";

export interface Secret {
  value: string;
  mask: string;
}

export function isSensitiveHeader(name: string, config: Pick<Config, "apiKey">): boolean {
  const lower = name.toLowerCase();
  return SENSITIVE_HEADERS.has(lower) || lower === config.apiKey?.headerName.toLowerCase();
}

/** "abcdefghijklmnop" -> "****mnop"; short values are masked fully. */
export function maskSecret(value: string): string {
  return value.length >= MIN_PARTIAL_LENGTH ? `${MASK}${value.slice(-4)}` : MASK;
}

/** Split "Scheme credentials" header values, e.g. "Bearer abc". */
function splitScheme(value: string): [scheme: string, credentials: string] | undefined {
  const match = /^([A-Za-z][\w.-]*)\s+(\S.*)$/.exec(value);
  return match ? [match[1] ?? "", match[2] ?? ""] : undefined;
}

/**
 * Mask a credential header value, keeping the auth scheme: "Bearer ****cret".
 * Basic credentials are masked fully because the base64 tail encodes the password.
 */
export function maskHeaderValue(value: string): string {
  const parts = splitScheme(value);
  if (!parts) return maskSecret(value);
  const [scheme, credentials] = parts;
  return scheme.toLowerCase() === "basic" ? `${scheme} ${MASK}` : `${scheme} ${maskSecret(credentials)}`;
}

export function maskHeaders(headers: Headers, config: Pick<Config, "apiKey">): Headers {
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name, isSensitiveHeader(name, config) ? maskHeaderValue(value) : value]),
  );
}

function decodeBasic(credentials: string): { pair: string; password: string } | undefined {
  try {
    const pair = Buffer.from(credentials, "base64").toString("utf8");
    const colon = pair.indexOf(":");
    return colon === -1 ? undefined : { pair, password: pair.slice(colon + 1) };
  } catch {
    return undefined;
  }
}

/**
 * Every credential that could show up in a result: configured auth, the proxy
 * password, and sensitive headers actually sent (including per-request ones).
 */
export function collectSecrets(config: Config, sentHeaders: Headers = {}): Secret[] {
  const secrets = new Map<string, string>();
  const add = (value: string | undefined, mask = maskSecret(value ?? "")) => {
    if (value === undefined || value.length < MIN_SCRUB_LENGTH) return;
    secrets.set(value, mask);
    // Also catch the value when it is echoed URL- or form-encoded.
    const encoded = encodeURIComponent(value);
    const strict = encoded.replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
    for (const variant of [encoded, strict]) if (variant !== value) secrets.set(variant, mask);
  };
  const addBasic = (credentials: string) => {
    add(credentials, MASK);
    const decoded = decodeBasic(credentials);
    add(decoded?.pair, MASK);
    add(decoded?.password, MASK);
  };

  if (config.auth.type === "bearer") add(config.auth.token);
  if (config.auth.type === "basic") {
    addBasic(Buffer.from(`${config.auth.username}:${config.auth.password}`).toString("base64"));
    add(config.auth.password, MASK);
  }
  add(config.apiKey?.value);
  if (config.proxyUrl?.password) add(decodeURIComponent(config.proxyUrl.password), MASK);

  for (const [name, value] of Object.entries(sentHeaders)) {
    if (!isSensitiveHeader(name, config)) continue;
    // Scrub only the credentials so "Bearer <token>" keeps its scheme when echoed.
    const parts = splitScheme(value);
    if (!parts) add(value);
    else if (parts[0].toLowerCase() === "basic") addBasic(parts[1]);
    else add(parts[1]);
  }

  return [...secrets].map(([value, mask]) => ({ value, mask })).sort((a, b) => b.value.length - a.value.length);
}

/** Replace every occurrence of each secret, longest first. */
export function scrub(text: string, secrets: Secret[]): string {
  let result = text;
  for (const { value, mask } of secrets) result = result.replaceAll(value, mask);
  return result;
}

export function scrubHeaders<T extends Record<string, string | string[] | undefined>>(headers: T, secrets: Secret[]): T {
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [
      name,
      Array.isArray(value) ? value.map((v) => scrub(v, secrets)) : value === undefined ? value : scrub(value, secrets),
    ]),
  ) as T;
}

/** Longest secret in bytes: extra body bytes to read so a secret crossing the size limit is still found. */
export function longestSecretBytes(secrets: Secret[]): number {
  return Math.max(0, ...secrets.map((s) => Buffer.byteLength(s.value)));
}
