# mcp-rest-api

An [MCP](https://modelcontextprotocol.io) server for testing REST APIs, built with Bun and TypeScript.
It runs over stdio and exposes one tool, `http_request`, that sends HTTP requests to a configured
base URL and returns status, headers, body and timing.

## Features

- All standard HTTP methods: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`, `TRACE`
- Detailed response: status code, status text, response headers, body, timing
- Request bodies for `POST`, `PUT` and `PATCH` (JSON objects/arrays or raw strings)
- Parameter binding: `{id}` / `:id` path placeholders and structured query params, URL-encoded for you
- Global headers from `HEADER_*` environment variables
  - Case-insensitive prefix (`HEADER_`, `header_`, `HeAdEr_`)
  - Header name case preserved
  - Priority: per-request > auth > global
- Authentication from environment variables: Basic, Bearer, API key
- Response size limit (default 10000 bytes) with truncation metadata; only the body is truncated
- SSL certificate verification, on by default, can be turned off for self-signed certificates
- Proxy support: SOCKS5, SOCKS5h, SOCKS4/4a, HTTP and HTTPS proxies, with `NO_PROXY`
- Credential masking: auth headers show as `Bearer ****cret` in the result, and secrets echoed back by the API are scrubbed from the response body and headers

## Requirements

- To run with `npx`: Node.js 20 or later
- To develop: [Bun](https://bun.sh) 1.4 or later

## Install

No install step is needed with `npx`:

```bash
BASE_URL=https://jsonplaceholder.typicode.com npx -y @piinalpin/mcp-rest-api
```

From source:

```bash
bun install
```

## Configuration

All configuration comes from environment variables. Only `BASE_URL` is required.

| Variable | Default | Description |
|---|---|---|
| `BASE_URL` | (required) | Base URL for all requests, e.g. `https://api.example.com/v1`. Query parameters on it are added to every request. |
| `HEADER_<Name>` | | Global header. `HEADER_X-Api-Version=2` sends `X-Api-Version: 2`. |
| `AUTH_BASIC_USERNAME` | | Basic auth username (needs `AUTH_BASIC_PASSWORD`) |
| `AUTH_BASIC_PASSWORD` | | Basic auth password |
| `AUTH_BEARER` | | Bearer token, sent as `Authorization: Bearer <token>` |
| `AUTH_APIKEY_HEADER_NAME` | | Header name for API key auth, e.g. `X-API-Key` |
| `AUTH_APIKEY_VALUE` | | API key value |
| `RESPONSE_SIZE_LIMIT` | `10000` | Maximum response body size in bytes |
| `ENABLE_SSL_VERIFY` | `true` | Set to `false` to accept self-signed or invalid certificates |
| `PROXY_URL` | | Proxy URL, e.g. `socks5://127.0.0.1:1080`, `socks5h://user:pass@host:1080`, `http://proxy:3128` |
| `NO_PROXY` | | Comma-separated hosts that bypass the proxy |
| `TIMEOUT_MS` | `30000` | Request timeout in milliseconds |

The server stops at startup with a clear message when the configuration is invalid.

### Custom headers

Every environment variable whose name starts with `HEADER_` (any case) becomes a header on every request.
The part after the prefix is used as the header name, with its case kept:

```bash
HEADER_Accept=application/json          # Accept: application/json
header_X-Request-Source=mcp             # X-Request-Source: mcp
HeAdEr_X-Tenant-ID=acme                 # X-Tenant-ID: acme
```

Header names with `-` cannot be set with `export` in most shells. Set them in the MCP client
`env` block (see [examples](examples/)) or with `env 'HEADER_X-Api-Version=2' bun run start`.

When the same header (compared case-insensitively) comes from more than one place, this order applies:

1. Per-request `headers` in the tool call (highest)
2. Authentication headers (`Authorization`, API key header)
3. Global `HEADER_*` headers (lowest)

### Authentication

Set one of these:

- **Basic:** `AUTH_BASIC_USERNAME` and `AUTH_BASIC_PASSWORD`
- **Bearer:** `AUTH_BEARER`
- **API key:** `AUTH_APIKEY_HEADER_NAME` and `AUTH_APIKEY_VALUE`

The API key can be combined with Basic or Bearer. Basic and Bearer cannot be used together because both
use the `Authorization` header. Credentials stay in the server environment and are never part of tool arguments.

### Credential masking

Credentials never appear in plain text in a tool result.

**Request summary.** Credential headers are masked and keep their auth scheme:

| Header sent | Shown as |
|---|---|
| `Authorization: Bearer eyJhbGciOi...x9Qk` | `Bearer ****x9Qk` |
| `Authorization: Basic YWxpY2U6...` | `Basic ****` (always fully masked; the base64 tail encodes the password) |
| `X-API-Key: key-1234567890` | `****7890` |

Values shorter than 12 characters are masked fully (`****`). Masked headers: `Authorization`,
`Proxy-Authorization`, `Cookie`, `X-API-Key`, `Api-Key`, `ApiKey`, `X-Auth-Token` and the
`AUTH_APIKEY_HEADER_NAME` header. This applies to auth from environment variables, to `HEADER_*`
headers, and to credentials passed in per-request `headers`.

**Response scrubbing.** Some APIs echo credentials back (debug endpoints, error messages, reflected headers).
Every occurrence of these secrets is replaced in the response body, response headers, request URL,
request body and error messages:

- Bearer token, API key value, Basic password and its base64 form
- Proxy password from `PROXY_URL`
- Credentials from per-request credential headers
- The URL-encoded forms of all of the above

Scrubbing runs before truncation, and the server reads extra bytes past `RESPONSE_SIZE_LIMIT`, so a secret
that crosses the limit is still replaced. Secrets shorter than 6 characters are masked in headers but are
not searched for in bodies, because short strings would replace normal content.

### Response size

Bodies larger than `RESPONSE_SIZE_LIMIT` bytes are truncated at a UTF-8 character boundary.
The status, headers and request summary are always complete. A truncated result contains:

```json
"truncation": {
  "originalSize": 52000,
  "originalSizeExact": true,
  "returnedSize": 10000,
  "truncationPoint": 10000,
  "sizeLimit": 10000,
  "message": "Response body truncated: returned 10000 of 52000 bytes (limit 10000). ..."
}
```

The server reads at most 50 MB of a body to measure it. For larger bodies `originalSizeExact` is `false`.

### SSL verification

Verification is on by default. For development servers with self-signed certificates:

```bash
ENABLE_SSL_VERIFY=false
```

The server writes a warning to stderr when verification is off. The setting also applies to the TLS
connection to an `https://` proxy.

### Proxy

`PROXY_URL` supports:

| Scheme | Notes |
|---|---|
| `socks5://` | SOCKS5, DNS resolved locally |
| `socks5h://` | SOCKS5, DNS resolved by the proxy |
| `socks4://`, `socks4a://` | SOCKS4 / SOCKS4a |
| `http://`, `https://` | HTTP proxy. HTTPS targets use a `CONNECT` tunnel. |

Proxy credentials go in the URL: `socks5://user:pass@host:1080`. Credentials are not shown in logs or tool output.

`NO_PROXY` entries: `*` (all hosts), `example.com` or `.example.com` (the domain and its subdomains),
`host:port` (only that port).

## Usage

Run the server directly (it waits for MCP messages on stdin):

```bash
BASE_URL=https://jsonplaceholder.typicode.com npx -y @piinalpin/mcp-rest-api
```

Or from source with Bun:

```bash
BASE_URL=https://jsonplaceholder.typicode.com bun run start
```

### Client setup

Most MCP clients use the same JSON shape:

```json
{
  "mcpServers": {
    "rest-api": {
      "command": "npx",
      "args": ["-y", "@piinalpin/mcp-rest-api"],
      "env": {
        "BASE_URL": "https://api.example.com/v1",
        "AUTH_BEARER": "your-token",
        "HEADER_Accept": "application/json"
      }
    }
  }
}
```

Some clients use a different key or format. [CLIENTS.md](CLIENTS.md) has the config file location, the
`mcp add` command and a ready-to-copy file in [examples/clients/](examples/clients/) for each of these:

| Client | Quick start |
|---|---|
| Claude Desktop | [claude-desktop.json](examples/clients/claude-desktop.json) |
| Claude Code | `claude mcp add rest-api -e BASE_URL=... -e AUTH_BEARER=... -- npx -y @piinalpin/mcp-rest-api` |
| OpenAI Codex | `codex mcp add rest-api --env BASE_URL=... --env AUTH_BEARER=... -- npx -y @piinalpin/mcp-rest-api` |
| OpenCode | [opencode.json](examples/clients/opencode.json) (`mcp` key, `type: local`, `environment`) |
| Command Code | `cmd mcp add --scope user -e BASE_URL=... -e AUTH_BEARER=... rest-api -- npx -y @piinalpin/mcp-rest-api` |
| Google Antigravity | [antigravity.mcp_config.json](examples/clients/antigravity.mcp_config.json) |
| GitHub Copilot (VS Code) | [vscode-copilot.mcp.json](examples/clients/vscode-copilot.mcp.json) as `.vscode/mcp.json` (`servers` key) |
| GitHub Copilot CLI | `copilot mcp add rest-api --env BASE_URL=... --env AUTH_BEARER=... -- npx -y @piinalpin/mcp-rest-api` |
| Cursor | [cursor.mcp.json](examples/clients/cursor.mcp.json) as `~/.cursor/mcp.json` or `.cursor/mcp.json` |
| Cline | [cline_mcp_settings.json](examples/clients/cline_mcp_settings.json) |
| Amp | `amp mcp add rest-api --env BASE_URL=... --env AUTH_BEARER=... -- npx -y @piinalpin/mcp-rest-api` |
| Hermes Agent | [hermes.config.yaml](examples/clients/hermes.config.yaml) (`mcp_servers` in `~/.hermes/config.yaml`) |
| Kimi Code | [kimi-code.mcp.json](examples/clients/kimi-code.mcp.json) as `~/.kimi-code/mcp.json` |
| Pi | `pi mcp add rest-api --exposure direct --env BASE_URL=... --env AUTH_BEARER=... -- npx -y @piinalpin/mcp-rest-api` |
| CodeBuddy | `codebuddy mcp add --scope user rest-api -e BASE_URL=... -e AUTH_BEARER=... -- npx -y @piinalpin/mcp-rest-api` |

### MCP Inspector

```bash
BASE_URL=https://jsonplaceholder.typicode.com npx @modelcontextprotocol/inspector npx -y @piinalpin/mcp-rest-api
```

## Tool: `http_request`

| Argument | Type | Required | Description |
|---|---|---|---|
| `method` | `GET` \| `POST` \| `PUT` \| `PATCH` \| `DELETE` \| `HEAD` \| `OPTIONS` \| `TRACE` | yes | HTTP method |
| `endpoint` | string | yes | Path relative to `BASE_URL`, starting with `/`. May include a query string and `{name}` / `:name` placeholders. |
| `pathParams` | object | no | Values for the endpoint placeholders |
| `queryParams` | object | no | Query parameters. Arrays repeat the key; `null` removes a param. |
| `body` | string, object or array | no | Only for `POST`, `PUT`, `PATCH`. Objects and arrays are sent as JSON. |
| `headers` | object | no | Per-request headers |

Example call:

```json
{ "method": "POST", "endpoint": "/users", "body": { "name": "Ada" } }
```

### Parameter binding

Write the endpoint as a template and pass the values separately. The server URL-encodes them,
so values with spaces, `/`, `&`, `?`, `#` or non-ASCII characters are safe.

```json
{
  "method": "GET",
  "endpoint": "/users/{userId}/posts/:postId",
  "pathParams": { "userId": 42, "postId": "hello world" },
  "queryParams": { "sort": "desc", "tag": ["news", "tech"], "draft": false }
}
```

Request URL: `https://api.example.com/v1/users/42/posts/hello%20world?sort=desc&tag=news&tag=tech&draft=false`

**Path params**

- `{name}` works anywhere in the endpoint, including the query string: `/search?q={term}`.
- `:name` works at the start of a path segment: `/users/:id`. A colon inside a segment stays literal,
  so `/v1/projects/{id}:batchGet` works.
- A value is always one path segment: `/` is encoded as `%2F`. The values `""`, `.` and `..` are rejected.
- A placeholder without a value is an error. A `pathParams` key with no placeholder adds a warning to
  `validation.messages`.

**Query params**

- Values can be strings, numbers, booleans, arrays of those, or `null`.
- Arrays repeat the key: `{"id": [1, 2]}` gives `?id=1&id=2`.
- A query param replaces a param with the same name from the endpoint or `BASE_URL`. `null` removes it.
- Priority, highest first: `queryParams`, then the endpoint query string, then `BASE_URL` query params.

When parameters are bound, the result shows the template as `request.endpoint` next to the final `request.url`.

Example result:

```json
{
  "request": {
    "url": "https://api.example.com/v1/users",
    "method": "POST",
    "headers": { "Authorization": "Bearer ****oken", "Content-Type": "application/json", "Content-Length": "14" },
    "body": "{\"name\":\"Ada\"}"
  },
  "response": {
    "statusCode": 201,
    "statusText": "Created",
    "timing": "84.2ms",
    "headers": { "content-type": "application/json" },
    "body": "{\"id\":1,\"name\":\"Ada\"}"
  },
  "validation": { "isError": false, "messages": ["Request completed successfully"] }
}
```

HTTP 4xx and 5xx responses are normal results with `validation.isError: true`. Redirects are not followed.
Invalid input, network errors, timeouts, TLS and proxy failures return an MCP tool error.
More examples: [examples/requests.md](examples/requests.md).

## Development

```bash
bun test            # unit and integration tests (local echo, SOCKS5, HTTP proxy and TLS servers)
bun run typecheck   # tsc --noEmit
bun run dev         # run with --watch
```

The TLS tests generate a self-signed certificate with `openssl` and are skipped when it is not installed.

### Build

```bash
bun run build       # dist/index.js: one Node.js file with all dependencies bundled
bun run compile     # dist/mcp-rest-api: a standalone binary that needs neither Node.js nor Bun
```

`dist/index.js` starts with `#!/usr/bin/env node` and is the package `bin`, so it runs with
`node dist/index.js`, `bun dist/index.js` or `npx`. All dependencies are bundled into it, so `npx` installs
nothing else.

### Test the npm package locally

```bash
bun run build
npm pack
```

Then run the tarball from a different directory. Use `--package`; npm 12 does not run a tarball path given as the command:

```bash
BASE_URL=https://jsonplaceholder.typicode.com npx -y --package=/absolute/path/to/piinalpin-mcp-rest-api-0.1.0.tgz mcp-rest-api
```

### Publish

```bash
npm login
npm publish
```

`prepublishOnly` runs the typecheck, the tests and the build first. The scoped package is published
as public (`publishConfig.access`).

## Project layout

```
src/index.ts      entry point: config, MCP server, stdio transport
src/config.ts     environment variable parsing and validation
src/headers.ts    HEADER_* parsing, auth headers, priority merge
src/mask.ts       credential masking and secret scrubbing
src/url.ts        BASE_URL + endpoint resolution
src/params.ts     path placeholder and query parameter binding
src/proxy.ts      proxy agent selection and NO_PROXY matching
src/http.ts       HTTP transport (node:http / node:https), timeout, body reading
src/truncate.ts   UTF-8 safe body truncation
src/tool.ts       http_request tool schema and handler
```

Bun's `fetch` does not support SOCKS proxies, so requests go through `node:http` / `node:https` with
`socks-proxy-agent`, `http-proxy-agent` and `https-proxy-agent`. Requests with and without a proxy use the same code path.

## License

[MIT](LICENSE)
