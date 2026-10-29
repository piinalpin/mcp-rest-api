import { describe, expect, test } from "bun:test";
import { applyQueryParams, bindPathParams } from "../src/params.ts";
import { EndpointError } from "../src/url.ts";

describe("bindPathParams", () => {
  test("binds {name} and :name placeholders", () => {
    expect(bindPathParams("/users/{id}/posts/:postId", { id: 42, postId: "abc" })).toEqual({ endpoint: "/users/42/posts/abc", unused: [] });
  });

  test("URL-encodes values so they stay in one segment", () => {
    expect(bindPathParams("/files/{name}", { name: "a b/../c?d#e" }).endpoint).toBe("/files/a%20b%2F..%2Fc%3Fd%23e");
  });

  test("{name} also binds inside the query string, :name does not", () => {
    expect(bindPathParams("/search?q={term}&t=10:30", { term: "café & co" }).endpoint).toBe("/search?q=caf%C3%A9%20%26%20co&t=10:30");
  });

  test("colon inside a segment is literal", () => {
    expect(bindPathParams("/v1/projects/{p}:batchGet", { p: "x" }).endpoint).toBe("/v1/projects/x:batchGet");
  });

  test("reports unused params", () => {
    expect(bindPathParams("/users/{id}", { id: 1, extra: true }).unused).toEqual(["extra"]);
  });

  test("rejects missing and unsafe values", () => {
    expect(() => bindPathParams("/users/{id}/posts/:postId", { id: 1 })).toThrow(/postId/);
    expect(() => bindPathParams("/users/{id}")).toThrow(EndpointError);
    for (const bad of ["", ".", ".."]) expect(() => bindPathParams("/users/{id}", { id: bad })).toThrow(EndpointError);
  });

  test("endpoints without placeholders are unchanged", () => {
    expect(bindPathParams("/users?page=2")).toEqual({ endpoint: "/users?page=2", unused: [] });
  });
});

describe("applyQueryParams", () => {
  test("adds, repeats arrays, overrides and removes", () => {
    const url = new URL("https://a.b/x?page=1&keep=yes&drop=me");
    applyQueryParams(url, { page: 2, tag: ["a", "b c"], active: true, drop: null, q: "x&y=z" });
    expect(url.search).toBe("?keep=yes&page=2&tag=a&tag=b+c&active=true&q=x%26y%3Dz");
  });
});
