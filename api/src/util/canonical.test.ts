// SPDX-License-Identifier: Apache-2.0
// api/src/util/canonical.test.ts
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { canonicalSerialize, contentHash, type CanonicalAlgo } from "./canonical.js";

let sample: any;
before(() => {
  sample = {
    z: 3,
    a: "hello",
    n: 42,
    nested: { b: true, a: false },
    arr: [1, "2", { x: 9 }],
    when: new Date("2024-01-02T03:04:05.678Z"),
    bytes: new Uint8Array([1, 2, 3]),
  };
});

function sameHashAcrossKeyOrders(algo: CanonicalAlgo) {
  const v1 = { ...sample };
  const v2 = { a: sample.a, arr: sample.arr, bytes: sample.bytes, n: sample.n, nested: sample.nested, when: sample.when, z: sample.z };
  return Promise.all([contentHash(v1, algo), contentHash(v2, algo)]).then(([h1, h2]) => {
    assert.equal(h1, h2, `hash should be identical for different key orders (${algo})`);
  });
}

test("JCS: determinism & key order invariance", async () => {
  await sameHashAcrossKeyOrders("JCS");
  const bytes = canonicalSerialize(sample, "JCS");
  const bytes2 = canonicalSerialize(sample, "JCS");
  assert.deepEqual(bytes, bytes2, "JCS must be deterministic");
});

test("CBOR: determinism (library or fallback) & key order invariance", async () => {
  await sameHashAcrossKeyOrders("CBOR");
  const b1 = canonicalSerialize(sample, "CBOR");
  const b2 = canonicalSerialize(sample, "CBOR");
  assert.deepEqual(b1, b2, "CBOR output must be deterministic");
});

test("SSZ-lite: determinism & key order invariance", async () => {
  await sameHashAcrossKeyOrders("SSZ");
  const b1 = canonicalSerialize(sample, "SSZ");
  const b2 = canonicalSerialize(sample, "SSZ");
  assert.deepEqual(b1, b2, "SSZ-lite output must be deterministic");
});

test("contentHash: stable across runs for same input (JCS)", async () => {
  const h1 = await contentHash(sample, "JCS");
  const h2 = await contentHash(sample, "JCS");
  assert.equal(h1, h2, "contentHash (JCS) must be stable");
  assert.match(h1, /^0x[0-9a-f]{64}$/, "contentHash must be 0x + 64 hex");
});

test("handles Buffer/Uint8Array consistently (all algos)", async () => {
  const payload = { data: Buffer.from([10, 11, 12]) };
  const algos: CanonicalAlgo[] = ["JCS", "CBOR", "SSZ"];
  for (const a of algos) {
    const h = await contentHash(payload, a);
    assert.match(h, /^0x[0-9a-f]{64}$/);
  }
});

test("number & bigint normalization (JCS/SSZ)", async () => {
  const vNum = { n: 1234567890 };
  const vBig = { n: BigInt(1234567890) as unknown as number };
  // SSZ-lite encodes integers deterministically as i:<dec>, JCS uses JSON.stringify semantics
  const hNumJ = await contentHash(vNum, "JCS");
  const hBigJ = await contentHash(vBig, "JCS");
  assert.equal(hNumJ, hBigJ, "JCS: numeric forms should normalize identically when equal in value");

  const hNumS = await contentHash(vNum, "SSZ");
  const hBigS = await contentHash(vBig, "SSZ");
  assert.equal(hNumS, hBigS, "SSZ-lite: numeric forms should normalize identically when equal in value");
});

test("date normalization (JCS -> ISO string; CBOR/SSZ determinism)", async () => {
  const v1 = { t: new Date("2023-05-06T07:08:09.123Z") };
  const v2 = { t: new Date("2023-05-06T07:08:09.123Z") };
  for (const a of ["JCS", "CBOR", "SSZ"] as CanonicalAlgo[]) {
    const h1 = await contentHash(v1, a);
    const h2 = await contentHash(v2, a);
    assert.equal(h1, h2, `${a}: same date must hash the same`);
  }
});

test("array order is significant (all algos)", async () => {
  const v1 = { arr: [1, 2, 3] };
  const v2 = { arr: [3, 2, 1] };
  for (const a of ["JCS", "CBOR", "SSZ"] as CanonicalAlgo[]) {
    const h1 = await contentHash(v1, a);
    const h2 = await contentHash(v2, a);
    assert.notEqual(h1, h2, `${a}: different array order must produce different hashes`);
  }
});

test("circular structures should error in JCS (JSON limitation)", () => {
  const a: any = { x: 1 };
  a.self = a;
  assert.throws(() => canonicalSerialize(a, "JCS"), /circular|Converting circular structure/i);
});
