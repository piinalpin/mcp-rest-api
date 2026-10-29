#!/usr/bin/env node
// End-to-end check of a built server over stdio, using only Node.js built-ins.
// Usage: node scripts/smoke.mjs <command> [args...]
//   node scripts/smoke.mjs node dist/index.js
//   node scripts/smoke.mjs npx -y --package=/abs/path/package.tgz mcp-rest-api
import { spawn } from "node:child_process";
import { once } from "node:events";
import http from "node:http";
import readline from "node:readline";

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error("usage: node scripts/smoke.mjs <command> [args...]");
  process.exit(2);
}

const TOKEN = "smoke-secret-token-1234";
const TIMEOUT_MS = 180_000;

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function start(env, stdio) {
  // npx is npx.cmd on Windows, which needs a shell.
  return spawn(command, args, { env, stdio, shell: process.platform === "win32" });
}

const timer = setTimeout(() => fail(`timed out after ${TIMEOUT_MS}ms`), TIMEOUT_MS);

// 1. Invalid configuration: the server must exit with code 1 and explain why.
{
  const env = { ...process.env };
  delete env.BASE_URL;
  const child = start(env, ["ignore", "ignore", "pipe"]);
  let stderr = "";
  child.stderr.on("data", (chunk) => (stderr += chunk));
  const [code] = await once(child, "exit");
  assert(code === 1, `expected exit code 1 without BASE_URL, got ${code}`);
  assert(stderr.includes("BASE_URL is required"), `missing config error on stderr: ${stderr}`);
  console.log("ok: exits with a clear error when BASE_URL is missing");
}

// 2. Local echo API.
const api = http.createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ method: req.method, url: req.url, authorization: req.headers.authorization, body }));
  });
});
api.listen(0, "127.0.0.1");
await once(api, "listening");
const { port } = api.address();

// 3. MCP session over stdio.
const child = start({ ...process.env, BASE_URL: `http://127.0.0.1:${port}/v1`, AUTH_BEARER: TOKEN }, ["pipe", "pipe", "inherit"]);
child.on("exit", (code) => {
  if (pending.size > 0) fail(`server exited with code ${code} before answering`);
});

const pending = new Map();
let nextId = 1;
readline.createInterface({ input: child.stdout }).on("line", (line) => {
  const message = JSON.parse(line);
  const resolve = pending.get(message.id);
  if (resolve) {
    pending.delete(message.id);
    resolve(message);
  }
});

function send(message) {
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);
}

function request(method, params) {
  const id = nextId++;
  const response = new Promise((resolve) => pending.set(id, resolve));
  send({ id, method, params });
  return response;
}

const init = await request("initialize", {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "smoke", version: "0" },
});
assert(init.result?.serverInfo?.name === "@piinalpin/mcp-rest-api", `unexpected initialize result: ${JSON.stringify(init)}`);
send({ method: "notifications/initialized" });
console.log(`ok: initialize (${init.result.serverInfo.name} ${init.result.serverInfo.version})`);

const list = await request("tools/list", {});
assert(list.result?.tools?.some((tool) => tool.name === "http_request"), `http_request not listed: ${JSON.stringify(list)}`);
console.log("ok: tools/list returns http_request");

const call = await request("tools/call", {
  name: "http_request",
  arguments: {
    method: "POST",
    endpoint: "/users/{id}",
    pathParams: { id: 7 },
    queryParams: { tag: ["a", "b"] },
    body: { name: "smoke" },
  },
});
const text = call.result?.content?.[0]?.text ?? "";
assert(!call.result?.isError, `tool call failed: ${text || JSON.stringify(call)}`);
const report = JSON.parse(text);
const echo = JSON.parse(report.response.body);
assert(report.response.statusCode === 200, `status ${report.response.statusCode}`);
assert(echo.method === "POST", `method ${echo.method}`);
assert(echo.url === "/v1/users/7?tag=a&tag=b", `url ${echo.url}`);
assert(echo.body === '{"name":"smoke"}', `body ${echo.body}`);
assert(report.request.headers.Authorization === "Bearer ****1234", `request auth ${report.request.headers.Authorization}`);
assert(echo.authorization === "Bearer ****1234", `echoed auth not scrubbed: ${echo.authorization}`);
assert(!text.includes(TOKEN), "token leaked into the tool result");
console.log("ok: tools/call http_request (params, body, masking)");

clearTimeout(timer);
child.stdin.end();
child.kill();
api.close();
console.log("smoke test passed");
