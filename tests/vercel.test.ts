import { test } from "node:test";
import assert from "node:assert/strict";
import handler from "../api/index.ts";
test("Vercel refuses to use an ephemeral database or local upload directory", async () => {
  const previous = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  let status = 0,
    body = "";
  const response = {
    set statusCode(n: number) {
      status = n;
    },
    setHeader() {},
    end(text: string) {
      body = text;
    },
  };
  try {
    await handler({ url: "/api/index?__path=public" } as any, response as any);
    assert.equal(status, 503);
    assert.match(body, /setup incomplete/);
    assert.doesNotMatch(body, /password|service_role|postgresql:\/\//i);
  } finally {
    if (previous) process.env.DATABASE_URL = previous;
  }
});
