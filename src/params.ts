import { EndpointError } from "./url.ts";

export type Scalar = string | number | boolean;
export type PathParams = Record<string, Scalar>;
export type QueryParams = Record<string, Scalar | Scalar[] | null>;

/**
 * Placeholders: "{name}" anywhere in the endpoint (path or query string), and
 * ":name" at the start of a path segment ("/users/:id"). Names are
 * identifiers: letters, digits, "_", not starting with a digit.
 */
const PLACEHOLDER = /\{([A-Za-z_]\w*)\}|(?<=\/):([A-Za-z_]\w*)/g;

export interface BoundEndpoint {
  endpoint: string;
  /** pathParams that no placeholder used. */
  unused: string[];
}

/**
 * Replace placeholders with URL-encoded values. Values cannot add path
 * segments ("/" is encoded) and cannot be "", "." or "..".
 */
export function bindPathParams(endpoint: string, params: PathParams = {}): BoundEndpoint {
  const queryStart = endpoint.indexOf("?");
  const used = new Set<string>();
  const missing = new Set<string>();

  const bound = endpoint.replace(PLACEHOLDER, (match, braced: string | undefined, colon: string | undefined, offset: number) => {
    // ":name" only binds in the path; in a query string it is literal text.
    if (colon !== undefined && queryStart !== -1 && offset > queryStart) return match;
    const name = (braced ?? colon)!;
    if (!Object.hasOwn(params, name)) {
      missing.add(name);
      return match;
    }
    used.add(name);
    const value = String(params[name]);
    if (value === "" || value === "." || value === "..") {
      throw new EndpointError(`Path parameter "${name}" must not be empty, "." or ".." (got "${value}")`);
    }
    return encodeURIComponent(value);
  });

  if (missing.size > 0) {
    throw new EndpointError(`Missing value for path parameter(s): ${[...missing].join(", ")}. Pass them in "pathParams".`);
  }
  return { endpoint: bound, unused: Object.keys(params).filter((name) => !used.has(name)) };
}

/**
 * Add query params to the URL. They replace same-named params from the
 * endpoint or BASE_URL. Arrays repeat the key (?tag=a&tag=b); null removes it.
 */
export function applyQueryParams(url: URL, params: QueryParams = {}): void {
  for (const [name, value] of Object.entries(params)) {
    url.searchParams.delete(name);
    if (value === null) continue;
    for (const item of Array.isArray(value) ? value : [value]) url.searchParams.append(name, String(item));
  }
}
