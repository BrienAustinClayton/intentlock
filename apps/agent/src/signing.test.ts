import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildSignatureBase, canonicalJson, contentDigest, publicKeyB64, signRequest } from "./signing.ts";

const here = dirname(fileURLToPath(import.meta.url));
const vec = JSON.parse(readFileSync(resolve(here, "../../../data/eval/http_sig_vector.json"), "utf8"));
const body = Buffer.from(vec.request.body, vec.request.body_encoding);

test("public key derives from the vector private key", () => {
  assert.equal(publicKeyB64(vec.key.private_key), vec.key.public_key);
});

test("content digest matches the vector", () => {
  assert.equal(contentDigest(body), vec.expected.content_digest);
});

test("signature base and signature are byte-identical to the Python reference", () => {
  const p = vec.params;
  const out = signRequest({
    method: vec.request.method,
    targetUri: vec.request.target_uri,
    body,
    privateKeyB64: vec.key.private_key,
    keyid: p.keyid,
    created: p.created,
    expires: p.expires,
    nonce: p.nonce,
  });
  assert.equal(out.signatureBase, vec.expected.signature_base);
  assert.equal(
    buildSignatureBase("POST", vec.request.target_uri, vec.expected.content_digest, {
      created: p.created, expires: p.expires, nonce: p.nonce, keyid: p.keyid,
    }),
    vec.expected.signature_base,
  );
  assert.equal(out.Signature, vec.expected.headers.Signature);
  assert.equal(out["Signature-Input"], vec.expected.headers["Signature-Input"]);
  assert.equal(out["Content-Digest"], vec.expected.headers["Content-Digest"]);
  assert.equal(out["Content-Type"], vec.expected.headers["Content-Type"]);
});

test("empty-body digest (GET) matches the contract value", () => {
  assert.equal(contentDigest(Buffer.alloc(0)), "sha-256=:47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=:");
});

test("canonicalJson reproduces the vector body", () => {
  assert.equal(canonicalJson(JSON.parse(vec.request.body)), vec.request.body);
});
