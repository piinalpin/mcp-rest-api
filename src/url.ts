export class EndpointError extends Error {
  override name = "EndpointError";
}

/**
 * Resolve a relative endpoint against the base URL.
 * Only paths under the base URL are allowed: absolute URLs, scheme-relative
 * URLs and paths that escape the base path (e.g. via "..") are rejected.
 */
export function buildUrl(baseUrl: URL, endpoint: string): URL {
  if (!endpoint.startsWith("/")) {
    throw new EndpointError(`Endpoint must be a path starting with "/" (got "${endpoint}"). Absolute URLs are not allowed; requests always go to BASE_URL.`);
  }
  if (endpoint.startsWith("//") || endpoint.includes("\\")) {
    throw new EndpointError(`Endpoint "${endpoint}" is not a plain path`);
  }

  const basePath = baseUrl.pathname.replace(/\/+$/, "");
  const url = new URL(basePath + endpoint, baseUrl.origin);

  if (url.origin !== baseUrl.origin) {
    throw new EndpointError(`Endpoint "${endpoint}" resolves outside BASE_URL`);
  }
  if (basePath !== "" && url.pathname !== basePath && !url.pathname.startsWith(`${basePath}/`)) {
    throw new EndpointError(`Endpoint "${endpoint}" escapes the BASE_URL path "${basePath}"`);
  }

  // Query params on BASE_URL apply to every request unless the endpoint sets them.
  for (const [key, value] of baseUrl.searchParams) {
    if (!url.searchParams.has(key)) url.searchParams.append(key, value);
  }
  return url;
}
