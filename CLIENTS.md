# Client setup

`@piinalpin/mcp-rest-api` is a stdio MCP server, so any MCP client can start it with:

```bash
npx -y @piinalpin/mcp-rest-api
```

Configuration is passed through environment variables (see [README.md](README.md#configuration)).
Every example below uses the same settings:

| Variable | Example value |
|---|---|
| `BASE_URL` | `https://api.example.com/v1` |
| `AUTH_BEARER` | your token |
| `HEADER_Accept` | `application/json` |

Ready-to-copy files for each client are in [examples/clients/](examples/clients/).

Where a client can read variables from your shell (`${AUTH_BEARER}`, `{env:AUTH_BEARER}`, `${env:AUTH_BEARER}`),
the examples use that form so the token is not stored in a config file that may be committed. Replace it with the
literal value if you prefer.

Paths and commands were checked against each client's documentation in October 2026. Clients change often;
when something does not match, check the linked docs.

| Client | Config file | Top-level key | Example |
|---|---|---|---|
| [Claude Desktop](#claude-desktop) | `claude_desktop_config.json` | `mcpServers` | [claude-desktop.json](examples/clients/claude-desktop.json) |
| [Claude Code](#claude-code) | `.mcp.json`, `~/.claude.json` | `mcpServers` | [claude-code.mcp.json](examples/clients/claude-code.mcp.json) |
| [Codex](#openai-codex) | `~/.codex/config.toml` | `[mcp_servers.<name>]` | [codex.config.toml](examples/clients/codex.config.toml) |
| [OpenCode](#opencode) | `opencode.json` | `mcp` | [opencode.json](examples/clients/opencode.json) |
| [Command Code](#command-code) | `~/.commandcode/mcp.json`, `.mcp.json` | `mcpServers` | [commandcode.mcp.json](examples/clients/commandcode.mcp.json) |
| [Antigravity](#google-antigravity) | `~/.gemini/config/mcp_config.json` | `mcpServers` | [antigravity.mcp_config.json](examples/clients/antigravity.mcp_config.json) |
| [GitHub Copilot (VS Code)](#github-copilot-in-vs-code) | `.vscode/mcp.json` | `servers` | [vscode-copilot.mcp.json](examples/clients/vscode-copilot.mcp.json) |
| [GitHub Copilot CLI](#github-copilot-cli) | `~/.copilot/mcp-config.json` | `mcpServers` | [copilot-cli.mcp-config.json](examples/clients/copilot-cli.mcp-config.json) |
| [Cursor](#cursor) | `~/.cursor/mcp.json`, `.cursor/mcp.json` | `mcpServers` | [cursor.mcp.json](examples/clients/cursor.mcp.json) |
| [Cline](#cline) | `cline_mcp_settings.json` | `mcpServers` | [cline_mcp_settings.json](examples/clients/cline_mcp_settings.json) |
| [Amp](#amp) | `~/.config/amp/settings.json` | `amp.mcpServers` | [amp.settings.json](examples/clients/amp.settings.json) |
| [Hermes Agent](#hermes-agent) | `~/.hermes/config.yaml` | `mcp_servers` | [hermes.config.yaml](examples/clients/hermes.config.yaml) |
| [Kimi Code](#kimi-code) | `~/.kimi-code/mcp.json` | `mcpServers` | [kimi-code.mcp.json](examples/clients/kimi-code.mcp.json) |
| [Pi](#pi) | `~/.pi/agent/mcp.json` | `mcpServers` | [pi.mcp.json](examples/clients/pi.mcp.json) |
| [CodeBuddy](#codebuddy) | `~/.codebuddy/.mcp.json`, `.mcp.json` | `mcpServers` | [codebuddy.mcp.json](examples/clients/codebuddy.mcp.json) |

---

## Claude Desktop

Config file (open it from **Settings > Developer > Edit Config**):

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Example: [examples/clients/claude-desktop.json](examples/clients/claude-desktop.json)

```json
{
  "mcpServers": {
    "rest-api": {
      "command": "npx",
      "args": ["-y", "@piinalpin/mcp-rest-api"],
      "env": { "BASE_URL": "https://api.example.com/v1", "AUTH_BEARER": "your-token" }
    }
  }
}
```

Quit and restart Claude Desktop completely after editing. Logs: `~/Library/Logs/Claude/mcp*.log` (macOS),
`%APPDATA%\Claude\logs` (Windows).

Docs: https://modelcontextprotocol.io/docs/develop/connect-local-servers

## Claude Code

```bash
claude mcp add --env BASE_URL=https://api.example.com/v1 --env AUTH_BEARER=your-token --transport stdio --scope user rest-api -- npx -y @piinalpin/mcp-rest-api
```

- `--scope`: `local` (default, this project only, stored in `~/.claude.json`), `project` (`.mcp.json`, shared
  through git) or `user` (all projects).
- Keep another option (here `--transport` and `--scope`) between the last `--env` and the server name.
  Otherwise the name is read as one more `KEY=value` pair.

For a project, commit [examples/clients/claude-code.mcp.json](examples/clients/claude-code.mcp.json) as
`.mcp.json`. It reads `AUTH_BEARER` from your environment with `${AUTH_BEARER}`. Claude Code asks for approval
the first time it sees project servers.

If the first `npx` download is slow, raise the startup timeout: `MCP_TIMEOUT=60000 claude`.

Docs: https://code.claude.com/docs/en/mcp

## OpenAI Codex

Works for the Codex CLI, IDE extension and desktop app, which share one config.

```bash
codex mcp add rest-api --env BASE_URL=https://api.example.com/v1 --env AUTH_BEARER=your-token -- npx -y @piinalpin/mcp-rest-api
```

Or edit `~/.codex/config.toml` (or `.codex/config.toml` in a trusted project).
Example: [examples/clients/codex.config.toml](examples/clients/codex.config.toml)

```toml
[mcp_servers.rest-api]
command = "npx"
args = ["-y", "@piinalpin/mcp-rest-api"]
env_vars = ["AUTH_BEARER"]   # forwarded from your shell

[mcp_servers.rest-api.env]
BASE_URL = "https://api.example.com/v1"
```

If the first `npx` download takes longer than the 10 s default, add `startup_timeout_sec = 60`.

Docs: https://developers.openai.com/codex/mcp

## OpenCode

Global `~/.config/opencode/opencode.json`, or `opencode.json` in the project.
Example: [examples/clients/opencode.json](examples/clients/opencode.json)

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "rest-api": {
      "type": "local",
      "command": ["npx", "-y", "@piinalpin/mcp-rest-api"],
      "enabled": true,
      "environment": { "BASE_URL": "https://api.example.com/v1", "AUTH_BEARER": "{env:AUTH_BEARER}" }
    }
  }
}
```

OpenCode differs from most clients: the key is `mcp`, `type` must be `local`, `command` is one array with the
arguments, and environment variables go in `environment` (not `env`). `opencode mcp add` is an interactive
wizard.

Docs: https://opencode.ai/docs/mcp-servers/

## Command Code

```bash
cmd mcp add --transport stdio --scope user -e BASE_URL=https://api.example.com/v1 -e AUTH_BEARER=your-token rest-api -- npx -y @piinalpin/mcp-rest-api
```

- All options go before the server name.
- The default scope is `local` (this project only). `--scope project` writes `.mcp.json`, `--scope user` writes
  `~/.commandcode/mcp.json`.

Example: [examples/clients/commandcode.mcp.json](examples/clients/commandcode.mcp.json). A `${VAR}` that is
not set and has no default stops the server from starting; use `${VAR:-default}` for optional values.

Docs: https://commandcode.ai/docs/mcp

## Google Antigravity

There is no shell command. In the IDE open **… > MCP Servers > Manage MCP Servers > View raw config**
(in the Antigravity app: **Settings > Customizations > Installed MCP Servers**) and add the server.

- Global (IDE, app and CLI): `~/.gemini/config/mcp_config.json`
- Workspace: `<workspace>/.agents/mcp_config.json`
- Older installs use `~/.gemini/antigravity/mcp_config.json`.

Example: [examples/clients/antigravity.mcp_config.json](examples/clients/antigravity.mcp_config.json)

```json
{
  "mcpServers": {
    "rest-api": {
      "command": "npx",
      "args": ["-y", "@piinalpin/mcp-rest-api"],
      "env": { "BASE_URL": "https://api.example.com/v1", "AUTH_BEARER": "your-token" }
    }
  }
}
```

An organization admin allow-list can block the server ("Blocked by Admin Policy").

Docs: https://antigravity.google/docs/mcp

## GitHub Copilot in VS Code

Add [examples/clients/vscode-copilot.mcp.json](examples/clients/vscode-copilot.mcp.json) as `.vscode/mcp.json`
in the workspace, or run **MCP: Open User Configuration** for all workspaces. VS Code asks for the token on first
start and stores it securely.

```json
{
  "inputs": [
    { "type": "promptString", "id": "auth-bearer", "description": "API bearer token", "password": true }
  ],
  "servers": {
    "rest-api": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@piinalpin/mcp-rest-api"],
      "env": { "BASE_URL": "https://api.example.com/v1", "AUTH_BEARER": "${input:auth-bearer}" }
    }
  }
}
```

The key is `servers` (not `mcpServers`), and `type: "stdio"` is required. Or add it from a terminal
(writes the user configuration):

```bash
code --add-mcp '{"name":"rest-api","type":"stdio","command":"npx","args":["-y","@piinalpin/mcp-rest-api"],"env":{"BASE_URL":"https://api.example.com/v1"}}'
```

Servers that use `${input:...}` are not passed to Copilot harness sessions; use a literal value or `${env:NAME}`
there.

Docs: https://code.visualstudio.com/docs/copilot/customization/mcp-servers

## GitHub Copilot CLI

```bash
copilot mcp add rest-api --env BASE_URL=https://api.example.com/v1 --env AUTH_BEARER=your-token -- npx -y @piinalpin/mcp-rest-api
```

Or use `/mcp add` in a session, or edit `~/.copilot/mcp-config.json` (project: `.mcp.json` or
`.github/mcp.json`). Example: [examples/clients/copilot-cli.mcp-config.json](examples/clients/copilot-cli.mcp-config.json)

```json
{
  "mcpServers": {
    "rest-api": {
      "type": "local",
      "command": "npx",
      "args": ["-y", "@piinalpin/mcp-rest-api"],
      "env": { "BASE_URL": "https://api.example.com/v1", "AUTH_BEARER": "your-token" },
      "tools": ["*"]
    }
  }
}
```

Only `PATH` is passed from your shell. Set every server variable in `env`. Project servers load after you trust
the folder.

Docs: https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers

## Cursor

Global `~/.cursor/mcp.json` or project `.cursor/mcp.json`. The Cursor CLI (`agent`) uses the same files.
Example: [examples/clients/cursor.mcp.json](examples/clients/cursor.mcp.json)

```json
{
  "mcpServers": {
    "rest-api": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@piinalpin/mcp-rest-api"],
      "env": { "BASE_URL": "https://api.example.com/v1", "AUTH_BEARER": "${env:AUTH_BEARER}" }
    }
  }
}
```

Check it with `agent mcp list` and turn it on or off with `agent mcp enable rest-api` / `agent mcp disable rest-api`.

Docs: https://cursor.com/docs/context/mcp

## Cline

In the VS Code extension: **MCP Servers icon > Configure > Configure MCP Servers**, then paste
[examples/clients/cline_mcp_settings.json](examples/clients/cline_mcp_settings.json).

Cline CLI:

```bash
cline mcp add rest-api --yes -- npx -y @piinalpin/mcp-rest-api
```

The CLI has no option for environment variables. Add `env` to
`~/.cline/data/settings/cline_mcp_settings.json` afterwards:

```json
{
  "mcpServers": {
    "rest-api": {
      "command": "npx",
      "args": ["-y", "@piinalpin/mcp-rest-api"],
      "env": { "BASE_URL": "https://api.example.com/v1", "AUTH_BEARER": "your-token" },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

Docs: https://docs.cline.bot/mcp/configuring-mcp-servers

## Amp

```bash
amp mcp add rest-api --env BASE_URL=https://api.example.com/v1 --env AUTH_BEARER=your-token -- npx -y @piinalpin/mcp-rest-api
```

This writes `~/.config/amp/settings.json`. Add `--workspace` to write `.amp/settings.json`; workspace servers must
be approved with `amp mcp approve rest-api`. Example: [examples/clients/amp.settings.json](examples/clients/amp.settings.json)

```json
{
  "amp.mcpServers": {
    "rest-api": {
      "command": "npx",
      "args": ["-y", "@piinalpin/mcp-rest-api"],
      "env": { "BASE_URL": "https://api.example.com/v1", "AUTH_BEARER": "${AUTH_BEARER}" }
    }
  }
}
```

Docs: https://ampcode.com/docs/customize/mcp

## Hermes Agent

```bash
hermes mcp add rest-api --command npx --env BASE_URL=https://api.example.com/v1 AUTH_BEARER=your-token --args -y @piinalpin/mcp-rest-api
```

`--args` takes everything after it, so keep it last. The command connects to the server and lets you pick the
tools to enable. Or edit `~/.hermes/config.yaml`. Example: [examples/clients/hermes.config.yaml](examples/clients/hermes.config.yaml)

```yaml
mcp_servers:
  rest-api:
    command: "npx"
    args: ["-y", "@piinalpin/mcp-rest-api"]
    env:
      BASE_URL: "https://api.example.com/v1"
      AUTH_BEARER: "your-token"
```

Your shell environment is not passed to the server; set every variable in `env`. Run `/reload-mcp` after
editing. Hermes prefixes MCP tool names with `mcp_<server>_`.

Docs: https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp

## Kimi Code

Kimi Code CLI has no `mcp add` command. Edit `~/.kimi-code/mcp.json` (project: `.kimi-code/mcp.json`), or use
`/mcp-config` in the TUI. Example: [examples/clients/kimi-code.mcp.json](examples/clients/kimi-code.mcp.json)

```json
{
  "mcpServers": {
    "rest-api": {
      "command": "npx",
      "args": ["-y", "@piinalpin/mcp-rest-api"],
      "env": { "BASE_URL": "https://api.example.com/v1", "AUTH_BEARER": "your-token" }
    }
  }
}
```

Start a new session to load the server. Project servers stay disabled until you trust the folder.

The older Python Kimi CLI (archived) reads `~/.kimi/mcp.json` with the same format and has:

```bash
kimi mcp add --transport stdio -e BASE_URL=https://api.example.com/v1 -e AUTH_BEARER=your-token rest-api -- npx -y @piinalpin/mcp-rest-api
```

Docs: https://www.kimi.com/code/docs/en/kimi-code-cli/customization/mcp.html

## Pi

MCP is built into Pi since v0.99.0.

```bash
pi mcp add rest-api --exposure direct --env BASE_URL=https://api.example.com/v1 --env AUTH_BEARER=your-token -- npx -y @piinalpin/mcp-rest-api
```

This writes `~/.pi/agent/mcp.json`; add `--local` for `.pi/mcp.json`. Then run `/reload` in an open session.
Example: [examples/clients/pi.mcp.json](examples/clients/pi.mcp.json)

```json
{
  "mcpServers": {
    "rest-api": {
      "command": "npx",
      "args": ["-y", "@piinalpin/mcp-rest-api"],
      "env": { "BASE_URL": "https://api.example.com/v1", "AUTH_BEARER": "${AUTH_BEARER}" },
      "exposure": "direct"
    }
  }
}
```

`"exposure": "direct"` makes `http_request` a normal tool. With the default (`codemode`), it is only reachable
from code-mode scripts. If you installed `pi-mcp-adapter`, it replaces the built-in support and uses its own config.

Docs: https://pi.dev/docs/latest/mcp

## CodeBuddy

CodeBuddy Code CLI:

```bash
codebuddy mcp add --scope user rest-api -e BASE_URL=https://api.example.com/v1 -e AUTH_BEARER=your-token -- npx -y @piinalpin/mcp-rest-api
```

- Scopes: `local` (default), `project` (`.mcp.json`), `user` (`~/.codebuddy/.mcp.json`).
- `-e` takes several values, so put the server name before it and end with `--`.

Example: [examples/clients/codebuddy.mcp.json](examples/clients/codebuddy.mcp.json)

```json
{
  "mcpServers": {
    "rest-api": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@piinalpin/mcp-rest-api"],
      "env": { "BASE_URL": "https://api.example.com/v1", "AUTH_BEARER": "${AUTH_BEARER}" }
    }
  }
}
```

CodeBuddy IDE: **CodeBuddy Settings > MCP > Add MCP**, then paste the same `mcpServers` JSON.

Docs: https://www.codebuddy.ai/docs/cli/mcp

---

## Troubleshooting

- **Windows, "Connection closed":** some clients cannot start `npx` directly on Windows. Use
  `"command": "cmd"` and `"args": ["/c", "npx", "-y", "@piinalpin/mcp-rest-api"]`.
- **Timeout on first start:** the first `npx` run downloads the package. Start it once in a terminal
  (`BASE_URL=https://example.com npx -y @piinalpin/mcp-rest-api`, then Ctrl+C), or raise the client's startup timeout.
- **Server exits immediately:** the server stops when the configuration is invalid, for example when `BASE_URL` is
  missing. The reason is written to stderr, which most clients show in their MCP logs.
