import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, type Config } from "../src/config.ts";

export function makeConfig(env: Record<string, string>): Config {
  return loadConfig({ BASE_URL: "http://127.0.0.1:1/", ...env });
}

/** Echo server: returns method, path, headers and body as JSON; special paths for edge cases. */
export function startEchoServer(tls?: { cert: string; key: string }) {
  return Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    tls,
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname.endsWith("/big")) {
        const size = Number(url.searchParams.get("size") ?? 50_000);
        return new Response("x".repeat(size), { headers: { "Content-Type": "text/plain" } });
      }
      if (url.pathname.endsWith("/missing")) {
        return Response.json({ error: "not found" }, { status: 404, statusText: "Not Found" });
      }
      if (url.pathname.endsWith("/padded-echo")) {
        // Puts the Authorization value right at the RESPONSE_SIZE_LIMIT boundary.
        const pad = Number(url.searchParams.get("pad") ?? 0);
        return new Response("x".repeat(pad) + (req.headers.get("authorization") ?? "") + "y".repeat(100));
      }
      if (url.pathname.endsWith("/slow")) {
        await Bun.sleep(500);
        return new Response("late");
      }
      return Response.json(
        {
          method: req.method,
          path: url.pathname,
          query: url.search,
          headers: Object.fromEntries(req.headers),
          body: await req.text(),
        },
        { headers: { "X-Echo": "yes", "X-Seen-Authorization": req.headers.get("authorization") ?? "" } },
      );
    },
  });
}

/** Minimal no-auth SOCKS5 server (CONNECT only) that records each target. */
export function startSocks5Server(): Promise<{ port: number; targets: string[]; close: () => void }> {
  const targets: string[] = [];
  const server = net.createServer((client) => {
    client.on("error", () => {});
    client.once("data", () => {
      client.write(Buffer.from([5, 0]));
      client.once("data", (req: Buffer) => {
        const atyp = req[3];
        let host: string;
        let offset: number;
        if (atyp === 1) {
          host = Array.from(req.subarray(4, 8)).join(".");
          offset = 8;
        } else if (atyp === 3) {
          const len = req[4] ?? 0;
          host = req.subarray(5, 5 + len).toString();
          offset = 5 + len;
        } else {
          client.end(Buffer.from([5, 8, 0, 1, 0, 0, 0, 0, 0, 0]));
          return;
        }
        const port = req.readUInt16BE(offset);
        targets.push(`${host}:${port}`);
        const upstream = net.connect(port, host, () => {
          client.write(Buffer.from([5, 0, 0, 1, 0, 0, 0, 0, 0, 0]));
          client.pipe(upstream);
          upstream.pipe(client);
        });
        upstream.on("error", () => client.destroy());
      });
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as net.AddressInfo;
      resolve({ port, targets, close: () => server.close() });
    });
  });
}

/** Minimal HTTP forward proxy (absolute-URI requests and CONNECT tunnels). */
export function startHttpProxy(): Promise<{ port: number; seen: string[]; close: () => void }> {
  const seen: string[] = [];
  const server = http.createServer((req, res) => {
    seen.push(`${req.method} ${req.url}`);
    const upstream = http.request(req.url!, { method: req.method, headers: req.headers }, (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    });
    upstream.on("error", () => res.destroy());
    req.pipe(upstream);
  });
  server.on("connect", (req, client, head) => {
    seen.push(`CONNECT ${req.url}`);
    const [host, port] = (req.url ?? "").split(":");
    const upstream = net.connect(Number(port), host, () => {
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      upstream.write(head);
      upstream.pipe(client);
      client.pipe(upstream);
    });
    upstream.on("error", () => client.destroy());
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as net.AddressInfo;
      resolve({ port, seen, close: () => server.close() });
    });
  });
}

/** Self-signed cert for 127.0.0.1, or undefined when openssl is missing. */
export function selfSignedCert(): { cert: string; key: string } | undefined {
  const dir = mkdtempSync(join(tmpdir(), "mcp-rest-api-tls-"));
  try {
    execFileSync("openssl", [
      "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
      "-keyout", join(dir, "key.pem"), "-out", join(dir, "cert.pem"),
      "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1",
    ], { stdio: "ignore" });
  } catch {
    return undefined;
  }
  return { cert: readFileSync(join(dir, "cert.pem"), "utf8"), key: readFileSync(join(dir, "key.pem"), "utf8") };
}
