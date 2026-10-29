import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import pkg from "../package.json" with { type: "json" };
import { ConfigError, describeConfig, loadConfig, type Config } from "./config.ts";
import { registerHttpRequestTool } from "./tool.ts";

// stdout carries MCP frames only; all logging goes to stderr.
const log = (message: string) => console.error(`[mcp-rest-api] ${message}`);

let config: Config;
try {
  config = loadConfig();
} catch (error) {
  log(error instanceof ConfigError ? `Configuration error: ${error.message}` : String(error));
  process.exit(1);
}

if (!config.sslVerify) log("WARNING: SSL certificate verification is disabled (ENABLE_SSL_VERIFY=false)");

const server = new McpServer({ name: pkg.name, version: pkg.version });
registerHttpRequestTool(server, config);

await server.connect(new StdioServerTransport());
log(`Server running on stdio\n${describeConfig(config)}`);
