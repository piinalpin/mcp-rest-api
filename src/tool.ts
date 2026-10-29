import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { describeConfig, type Config } from "./config.ts";
import { buildRequestHeaders, hasHeader, type Headers } from "./headers.ts";
import { executeRequest, HttpError } from "./http.ts";
import { collectSecrets, longestSecretBytes, maskHeaders, scrub, scrubHeaders } from "./mask.ts";
import { applyQueryParams, bindPathParams, type PathParams, type QueryParams } from "./params.ts";
import { createProxyAgent } from "./proxy.ts";
import { limitBody, type TruncationInfo } from "./truncate.ts";
import { buildUrl, EndpointError } from "./url.ts";

export const TOOL_NAME = "http_request";
export const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "TRACE"] as const;
export const BODY_METHODS: ReadonlySet<string> = new Set(["POST", "PUT", "PATCH"]);

export const inputSchema = {
  method: z.enum(METHODS).describe("HTTP method"),
  endpoint: z
    .string()
    .min(1)
    .describe(
      'Path relative to BASE_URL, starting with "/". May include a query string. Placeholders "{name}" (anywhere) and ":name" (path segment) are filled from pathParams, e.g. "/users/{id}/posts" or "/users/:id/posts". Absolute URLs are rejected.',
    ),
  pathParams: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .optional()
    .describe('Values for endpoint placeholders, e.g. {"id": 42}. Values are URL-encoded; "/" cannot add path segments.'),
  queryParams: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.union([z.string(), z.number(), z.boolean()]))]))
    .optional()
    .describe(
      'Query parameters, URL-encoded and added to the URL, e.g. {"page": 2, "tag": ["a", "b"]} -> ?page=2&tag=a&tag=b. They replace same-named params from the endpoint or BASE_URL; null removes one.',
    ),
  body: z
    .union([z.string(), z.record(z.string(), z.unknown()), z.array(z.unknown())])
    .optional()
    .describe("Request body, only for POST, PUT and PATCH. Objects and arrays are sent as JSON; strings are sent as-is."),
  headers: z
    .record(z.string(), z.string())
    .optional()
    .describe("Per-request headers. They override auth and global HEADER_* headers with the same name (case-insensitive)."),
};

export type RequestInput = {
  method: (typeof METHODS)[number];
  endpoint: string;
  pathParams?: PathParams;
  queryParams?: QueryParams;
  body?: string | Record<string, unknown> | unknown[];
  headers?: Headers;
};

export interface RequestReport {
  /** `endpoint` is the template as given, present only when parameters were bound. */
  request: { url: string; method: string; endpoint?: string; headers: Headers; body?: string };
  response: {
    statusCode: number;
    statusText: string;
    timing: string;
    headers: Record<string, string | string[] | undefined>;
    body: string;
  };
  validation: { isError: boolean; messages: string[] };
  truncation?: TruncationInfo;
}

export class ToolInputError extends Error {
  override name = "ToolInputError";
}

function encodeBody(input: RequestInput, headers: Headers): { bytes?: Uint8Array; text?: string } {
  if (input.body === undefined) return {};
  if (!BODY_METHODS.has(input.method)) {
    throw new ToolInputError(`A request body is only allowed for POST, PUT and PATCH, not ${input.method}`);
  }
  const text = typeof input.body === "string" ? input.body : JSON.stringify(input.body);
  if (typeof input.body !== "string" && !hasHeader(headers, "content-type")) {
    headers["Content-Type"] = "application/json";
  }
  return { bytes: new TextEncoder().encode(text), text };
}

function validationMessages(statusCode: number, truncation?: TruncationInfo, unusedPathParams: string[] = []): string[] {
  const messages: string[] = [];
  if (statusCode >= 200 && statusCode < 300) messages.push("Request completed successfully");
  else if (statusCode >= 300 && statusCode < 400) messages.push(`Redirect (${statusCode}); redirects are not followed`);
  else if (statusCode >= 400 && statusCode < 500) messages.push(`Client error (${statusCode})`);
  else if (statusCode >= 500) messages.push(`Server error (${statusCode})`);
  else messages.push(`Unexpected status code ${statusCode}`);
  if (unusedPathParams.length > 0) {
    messages.push(`Unused pathParams (no matching placeholder in the endpoint): ${unusedPathParams.join(", ")}`);
  }
  if (truncation) messages.push(truncation.message);
  return messages;
}

/** Run one request and build the report. Throws ToolInputError, EndpointError or HttpError. */
export async function performRequest(config: Config, input: RequestInput): Promise<RequestReport> {
  const bound = bindPathParams(input.endpoint, input.pathParams);
  const url = buildUrl(config.baseUrl, bound.endpoint);
  applyQueryParams(url, input.queryParams);
  const templated = bound.endpoint !== input.endpoint || input.queryParams !== undefined;
  const headers = buildRequestHeaders(config, input.headers);
  const secrets = collectSecrets(config, headers);
  const body = encodeBody(input, headers);
  if (body.bytes && !hasHeader(headers, "content-length")) headers["Content-Length"] = String(body.bytes.length);

  const response = await executeRequest({
    url,
    method: input.method,
    headers,
    body: body.bytes,
    agent: createProxyAgent(config, url),
    sslVerify: config.sslVerify,
    timeoutMs: config.timeoutMs,
    // Read past the limit so a secret crossing it can still be scrubbed.
    keepBytes: config.responseSizeLimit + longestSecretBytes(secrets),
  });

  const limited = limitBody(response.body, response.bodySize, config.responseSizeLimit, response.bodySizeExact, (text) =>
    scrub(text, secrets),
  );
  return {
    request: {
      url: scrub(url.href, secrets),
      method: input.method,
      ...(templated && { endpoint: scrub(input.endpoint, secrets) }),
      headers: maskHeaders(headers, config),
      ...(body.text !== undefined && { body: scrub(body.text, secrets) }),
    },
    response: {
      statusCode: response.statusCode,
      statusText: response.statusText,
      timing: `${response.timingMs.toFixed(1)}ms`,
      headers: scrubHeaders(response.headers, secrets),
      body: limited.body,
    },
    validation: {
      isError: response.statusCode >= 400,
      messages: validationMessages(response.statusCode, limited.truncation, bound.unused),
    },
    ...(limited.truncation && { truncation: limited.truncation }),
  };
}

const TLS_CODES = new Set([
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "CERT_HAS_EXPIRED",
  "ERR_TLS_CERT_ALTNAME_INVALID",
]);

export function errorResult(error: unknown, config: Config): CallToolResult {
  const err = error instanceof Error ? error : new Error(String(error));
  const code = (err as { code?: string }).code;
  const kind =
    err instanceof ToolInputError || err instanceof EndpointError ? "Invalid request" : err instanceof HttpError ? "Request failed" : "Unexpected error";
  const lines = [`${kind}: ${scrub(err.message, collectSecrets(config))}`];
  if (code) lines.push(`Code: ${code}`);
  if (code && TLS_CODES.has(code) && config.sslVerify) {
    lines.push("Hint: certificate verification failed. For self-signed certificates in development, set ENABLE_SSL_VERIFY=false.");
  }
  return { isError: true, content: [{ type: "text", text: lines.join("\n") }] };
}

export function registerHttpRequestTool(server: McpServer, config: Config): void {
  server.registerTool(
    TOOL_NAME,
    {
      title: "HTTP request",
      description: [
        "Send an HTTP request to the configured REST API and return status, headers, body and timing.",
        "Auth and global headers come from server configuration; per-request headers override them.",
        `Bodies larger than ${config.responseSizeLimit} bytes are truncated (see the "truncation" field).`,
        "",
        describeConfig(config),
      ].join("\n"),
      inputSchema,
      annotations: { openWorldHint: true },
    },
    async (input): Promise<CallToolResult> => {
      try {
        const report = await performRequest(config, input);
        return { content: [{ type: "text", text: JSON.stringify(report, null, 2) }] };
      } catch (error) {
        return errorResult(error, config);
      }
    },
  );
}
