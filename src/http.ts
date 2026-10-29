import http, { type Agent, type IncomingHttpHeaders } from "node:http";
import https from "node:https";

/** Stop reading a body after this many bytes and report its size as a lower bound. */
export const MAX_READ_BYTES = 50 * 1024 * 1024;

export interface HttpRequest {
  url: URL;
  method: string;
  headers: Record<string, string>;
  body?: Uint8Array;
  agent?: Agent;
  sslVerify: boolean;
  timeoutMs: number;
  /** Bytes of the body kept in memory; the rest is only counted. */
  keepBytes: number;
}

export interface HttpResponse {
  statusCode: number;
  statusText: string;
  headers: IncomingHttpHeaders;
  /** First `keepBytes` bytes of the body. */
  body: Uint8Array;
  bodySize: number;
  bodySizeExact: boolean;
  timingMs: number;
}

export class HttpError extends Error {
  override name = "HttpError";
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

export function executeRequest(request: HttpRequest): Promise<HttpResponse> {
  const transport = request.url.protocol === "https:" ? https : http;
  const started = performance.now();

  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (error: Error & { code?: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error instanceof HttpError ? error : new HttpError(error.message, error.code));
    };

    const req = transport.request(
      request.url,
      {
        method: request.method,
        headers: request.headers,
        agent: request.agent,
        rejectUnauthorized: request.sslVerify,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let kept = 0;
        let size = 0;
        let exact = true;

        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (kept < request.keepBytes) {
            const slice = chunk.subarray(0, request.keepBytes - kept);
            chunks.push(slice);
            kept += slice.length;
          }
          if (size > MAX_READ_BYTES) {
            exact = false;
            finish();
            res.destroy();
          }
        });
        res.on("end", () => finish());
        res.on("error", fail);

        function finish() {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve({
            statusCode: res.statusCode ?? 0,
            statusText: res.statusMessage ?? "",
            headers: res.headers,
            body: Buffer.concat(chunks),
            bodySize: size,
            bodySizeExact: exact,
            timingMs: performance.now() - started,
          });
        }
      },
    );

    const timer = setTimeout(() => {
      req.destroy(new HttpError(`Request timed out after ${request.timeoutMs}ms`, "ETIMEDOUT"));
    }, request.timeoutMs);

    req.on("error", fail);
    req.end(request.body);
  });
}
