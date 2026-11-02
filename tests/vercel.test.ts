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

import {startupDiagnostic} from '../server/diagnostics.ts';
test('startup diagnostics classify failures without logging credentials',()=>{
 const d=startupDiagnostic({code:'28P01',message:'password authentication failed postgresql://secret:password@host'});
 assert.equal(d.category,'database_authentication');assert.equal(d.code,'28P01');assert.doesNotMatch(JSON.stringify(d),/secret|password@host|postgresql/);
 assert.equal(startupDiagnostic({code:'SELF_SIGNED_CERT_IN_CHAIN',message:'self-signed certificate'}).category,'database_tls');
});
