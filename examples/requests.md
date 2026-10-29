# Example `http_request` calls

All examples assume `BASE_URL=https://api.example.com/v1`. The `endpoint` is always a path
relative to `BASE_URL`; absolute URLs are rejected.

## GET with query string

```json
{ "method": "GET", "endpoint": "/users?page=2&limit=10" }
```

## Path and query parameter binding

`{name}` and `:name` placeholders are filled from `pathParams`. `queryParams` are encoded and added to the URL.

```json
{
  "method": "GET",
  "endpoint": "/users/{userId}/orders/:orderId",
  "pathParams": { "userId": 42, "orderId": "A/B 7" },
  "queryParams": { "expand": ["items", "payments"], "currency": "EUR", "debug": null }
}
```

Sends `GET https://api.example.com/v1/users/42/orders/A%2FB%207?expand=items&expand=payments&currency=EUR`.

Placeholders in the query string:

```json
{ "method": "GET", "endpoint": "/search?q={term}&limit=10", "pathParams": { "term": "café & bar" } }
```

Sends `GET https://api.example.com/v1/search?q=caf%C3%A9%20%26%20bar&limit=10`.

With a body:

```json
{
  "method": "PATCH",
  "endpoint": "/projects/{projectId}/members/{memberId}",
  "pathParams": { "projectId": "p-1", "memberId": 99 },
  "queryParams": { "notify": true },
  "body": { "role": "admin" }
}
```

## POST JSON body

Objects and arrays are serialized as JSON. `Content-Type: application/json` is added
unless you set a content type yourself.

```json
{
  "method": "POST",
  "endpoint": "/users",
  "body": { "name": "Ada Lovelace", "email": "ada@example.com" }
}
```

## PUT / PATCH

```json
{ "method": "PUT", "endpoint": "/users/42", "body": { "name": "Ada", "email": "ada@example.com" } }
```

```json
{ "method": "PATCH", "endpoint": "/users/42", "body": { "email": "new@example.com" } }
```

## Raw string body with a custom content type

```json
{
  "method": "POST",
  "endpoint": "/forms/login",
  "body": "username=ada&remember=true",
  "headers": { "Content-Type": "application/x-www-form-urlencoded" }
}
```

## DELETE, HEAD, OPTIONS

```json
{ "method": "DELETE", "endpoint": "/users/42" }
```

```json
{ "method": "HEAD", "endpoint": "/health" }
```

```json
{ "method": "OPTIONS", "endpoint": "/users" }
```

## Override headers for one request

Per-request headers win over auth and `HEADER_*` headers, compared case-insensitively.

```json
{
  "method": "GET",
  "endpoint": "/reports",
  "headers": { "Accept": "text/csv", "Authorization": "Bearer one-off-token" }
}
```

## Example response

```json
{
  "request": {
    "url": "https://api.example.com/v1/users",
    "method": "POST",
    "headers": {
      "Accept": "application/json",
      "Authorization": "Bearer ****9Qk2",
      "Content-Type": "application/json",
      "Content-Length": "48"
    },
    "body": "{\"name\":\"Ada Lovelace\",\"email\":\"ada@example.com\"}"
  },
  "response": {
    "statusCode": 201,
    "statusText": "Created",
    "timing": "84.2ms",
    "headers": {
      "content-type": "application/json",
      "location": "/v1/users/43"
    },
    "body": "{\"id\":43,\"name\":\"Ada Lovelace\",\"email\":\"ada@example.com\"}"
  },
  "validation": {
    "isError": false,
    "messages": ["Request completed successfully"]
  }
}
```

## Masked credentials in an echoed response

With `AUTH_BEARER=eyJhbGciOiJIUzI1NiJ9.e30.x9Qk2`, an endpoint that reflects the request headers
returns the token masked everywhere in the result:

```json
{
  "request": {
    "url": "https://api.example.com/v1/debug/headers",
    "method": "GET",
    "headers": { "Authorization": "Bearer ****9Qk2" }
  },
  "response": {
    "statusCode": 200,
    "statusText": "OK",
    "timing": "41.7ms",
    "headers": { "content-type": "application/json" },
    "body": "{\"authorization\":\"Bearer ****9Qk2\"}"
  },
  "validation": { "isError": false, "messages": ["Request completed successfully"] }
}
```

## Truncated response

When the body is larger than `RESPONSE_SIZE_LIMIT` (default 10000 bytes), only the body is cut.
Status, headers and request details stay complete, and a `truncation` block is added.

```json
{
  "request": { "url": "https://api.example.com/v1/logs", "method": "GET", "headers": {} },
  "response": {
    "statusCode": 200,
    "statusText": "OK",
    "timing": "120.5ms",
    "headers": { "content-type": "text/plain", "content-length": "52000" },
    "body": "...first 10000 bytes..."
  },
  "validation": {
    "isError": false,
    "messages": [
      "Request completed successfully",
      "Response body truncated: returned 10000 of 52000 bytes (limit 10000). Set RESPONSE_SIZE_LIMIT to change the limit."
    ]
  },
  "truncation": {
    "originalSize": 52000,
    "originalSizeExact": true,
    "returnedSize": 10000,
    "truncationPoint": 10000,
    "sizeLimit": 10000,
    "message": "Response body truncated: returned 10000 of 52000 bytes (limit 10000). Set RESPONSE_SIZE_LIMIT to change the limit."
  }
}
```

## Errors

HTTP error statuses (4xx, 5xx) are normal results with `validation.isError: true`.
Network failures, timeouts, TLS and proxy errors, and invalid input return an MCP tool error:

```text
Request failed: self signed certificate
Code: DEPTH_ZERO_SELF_SIGNED_CERT
Hint: certificate verification failed. For self-signed certificates in development, set ENABLE_SSL_VERIFY=false.
```
