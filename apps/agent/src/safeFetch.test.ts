import assert from "node:assert/strict";
import { test } from "node:test";
import { assertPublicUrl } from "./safeFetch.ts";

test("agent page fetches refuse private, metadata and odd URLs", async () => {
  for (const u of [
    "http://169.254.169.254/latest/meta-data/", "http://127.0.0.1:8000/lab/reset", "http://localhost/x",
    "http://10.0.0.5/", "http://[::1]/", "http://[::ffff:127.0.0.1]/", "file:///etc/passwd",
    "http://user:pw@example.com/", "http://metadata.google.internal/",
  ]) {
    await assert.rejects(assertPublicUrl(u), u);
  }
});

test("public IP literals pass", async () => {
  assert.equal((await assertPublicUrl("https://93.184.216.34/p")).hostname, "93.184.216.34");
});
