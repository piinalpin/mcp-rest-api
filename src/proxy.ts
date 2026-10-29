import type { Agent } from "node:http";
import { HttpProxyAgent } from "http-proxy-agent";
import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";
import type { Config } from "./config.ts";

function defaultPort(protocol: string): string {
  return protocol === "https:" ? "443" : "80";
}

/**
 * NO_PROXY matching with curl-like rules: "*" matches everything, "example.com"
 * and ".example.com" match the host and its subdomains, "host:port" also
 * requires the port to match.
 */
export function bypassesProxy(target: URL, noProxy: string[]): boolean {
  const host = target.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const port = target.port || defaultPort(target.protocol);
  return noProxy.some((entry) => {
    if (entry === "*") return true;
    // "host:port" or "[ipv6]:port"; a bare IPv6 address has no port part.
    const withPort = /^([^:]+|\[[^\]]+\]):(\d+)$/.exec(entry);
    if (withPort && withPort[2] !== port) return false;
    const pattern = (withPort?.[1] ?? entry).replace(/^\*?\./, "").replace(/^\[|\]$/g, "");
    return host === pattern || host.endsWith(`.${pattern}`);
  });
}

function isSocks(proxyUrl: URL): boolean {
  return proxyUrl.protocol.startsWith("socks");
}

/**
 * Agent that routes a request to `target` through PROXY_URL, or undefined for
 * a direct connection. TLS options for the target (rejectUnauthorized) travel
 * with the request options; agents here only carry proxy settings.
 */
export function createProxyAgent(config: Pick<Config, "proxyUrl" | "noProxy" | "sslVerify">, target: URL): Agent | undefined {
  const { proxyUrl } = config;
  if (!proxyUrl || bypassesProxy(target, config.noProxy)) return undefined;

  if (isSocks(proxyUrl)) return new SocksProxyAgent(proxyUrl);

  // TLS settings below apply to the connection to an https:// proxy itself.
  const proxyTls = { rejectUnauthorized: config.sslVerify };
  return target.protocol === "https:"
    ? new HttpsProxyAgent(proxyUrl, proxyTls) // CONNECT tunnel
    : new HttpProxyAgent(proxyUrl, proxyTls); // absolute-URI forwarding
}

/** Proxy URL safe for logs and tool output (credentials removed). */
export function describeProxy(proxyUrl: URL | undefined): string | undefined {
  return proxyUrl ? `${proxyUrl.protocol}//${proxyUrl.host}` : undefined;
}
