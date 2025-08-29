// SPDX-License-Identifier: Apache-2.0
// api/src/util/canonical.ts
/**
 * Canonical serialization utils for Privora
 * - JCS (deterministic JSON, RFC 8785'e yakın)
 * - Canonical CBOR (subset; maps sorted, no indefinite)
 * - SSZ-lite (MVP için deterministik, tam SSZ değildir)
 *
 * Tipik kullanım:
 *   import { canonicalSerialize, contentHash } from "../util/canonical.js";
 *   const bytes = canonicalSerialize(obj, process.env.MERKLE_LEAF_CANON as any || "JCS");
 *   const leafHash = contentHash(obj, "JCS"); // "0x..." hex
 */

import crypto from "node:crypto";

export type CanonicalAlgo = "JCS" | "CBOR" | "SSZ";

/* ---------------------------
 * Helpers
 * --------------------------*/
export function toHex(u8: Uint8Array) {
  return "0x" + Buffer.from(u8).toString("hex");
}
export function sha256Hex(u8: Uint8Array) {
  return "0x" + crypto.createHash("sha256").update(u8).digest("hex");
}
function utf8(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/* ---------------------------
 * JCS (Deterministic JSON)
 * - Objelerde anahtarlar lexicographic sırada
 * - Array düzeni korunur
 * - Number => JSON spec (JS Number.toString())
 * --------------------------*/
export function jcsStringify(value: unknown): string {
  return JSON.stringify(value, (_k, v) => {
    if (!v || typeof v !== "object" || Array.isArray(v)) return v;
    const sorted = Object.keys(v as Record<string, unknown>).sort();
    const out: Record<string, unknown> = {};
    for (const k of sorted) out[k] = (v as any)[k];
    return out;
  });
}
export function jcsSerialize(value: unknown): Uint8Array {
  return utf8(jcsStringify(value));
}

/* ---------------------------
 * Canonical CBOR (subset)
 * - Major types: 0 (uint), 1 (neg int), 3 (text), 4 (array), 5 (map), 7 (true/false/null)
 * - Map anahtarları UTF-8 text key lexicographic olarak sıralanır (basitleştirilmiş kural)
 * - Indefinite-length yok; canonical minimal length
 * - Amaç: MVP için deterministik byte dizisi sağlamak
 * --------------------------*/
function cborUInt(buf: number[], majorType: number, val: number) {
  if (val < 24) buf.push((majorType << 5) | val);
  else if (val < 0x100) buf.push((majorType << 5) | 24, val);
  else if (val < 0x10000) buf.push((majorType << 5) | 25, (val >> 8) & 0xff, val & 0xff);
  else if (val < 0x100000000) {
    buf.push((majorType << 5) | 26,
      (val >>> 24) & 0xff, (val >>> 16) & 0xff, (val >>> 8) & 0xff, val & 0xff);
  } else {
    // JS number limiti; daha büyükleri string olarak encode edeceğiz
    const big = BigInt(val);
    buf.push((majorType << 5) | 27,
      Number((big >> 56n) & 0xffn),
      Number((big >> 48n) & 0xffn),
      Number((big >> 40n) & 0xffn),
      Number((big >> 32n) & 0xffn),
      Number((big >> 24n) & 0xffn),
      Number((big >> 16n) & 0xffn),
      Number((big >> 8n) & 0xffn),
      Number(big & 0xffn)
    );
  }
}
function cborText(buf: number[], s: string) {
  const b = utf8(s);
  cborUInt(buf, 3, b.length);
  buf.push(...b);
}
function cborArray(buf: number[], arr: any[]) {
  cborUInt(buf, 4, arr.length);
  for (const v of arr) cborAny(buf, v);
}
function cborMap(buf: number[], obj: Record<string, any>) {
  const keys = Object.keys(obj).sort(); // canonical: key-sort (UTF-8)
  cborUInt(buf, 5, keys.length);
  for (const k of keys) {
    cborText(buf, k);
    cborAny(buf, obj[k]);
  }
}
function cborAny(buf: number[], v: any) {
  if (v === null) { buf.push(0xf6); return; }
  switch (typeof v) {
    case "boolean": buf.push(v ? 0xf5 : 0xf4); return;
    case "number":
      if (!Number.isFinite(v) || Math.floor(v) !== v || v < 0) {
        // Basitlik: tam sayı değilse metin olarak encode (deterministik ama approximate değil)
        cborText(buf, String(v));
        return;
      }
      cborUInt(buf, 0, v);
      return;
    case "string": cborText(buf, v); return;
    case "object":
      if (Array.isArray(v)) { cborArray(buf, v); return; }
      cborMap(buf, v as Record<string, unknown>);
      return;
    default:
      // undefined / function / symbol: encode null
      buf.push(0xf6); return;
  }
}
export function cborSerialize(value: unknown): Uint8Array {
  const buf: number[] = [];
  cborAny(buf, value);
  return new Uint8Array(buf);
}

/* ---------------------------
 * SSZ-lite (MVP)
 * - Tam SSZ değildir; deterministik, tip etiketli düz byte akışı
 * - string -> "s:" + value
 * - number (int) -> "i:" + decimal
 * - boolean -> "b:0/1"
 * - null -> "n"
 * - array -> "a[" + items + "]"
 * - object -> "o{" + sorted key=value + "}"
 * --------------------------*/
function sszLite(value: unknown): string {
  if (value === null) return "n";
  const t = typeof value;
  if (t === "string") return "s:" + value;
  if (t === "number") return Number.isFinite(value) && Math.floor(value) === value ? "i:" + String(value) : "s:" + String(value);
  if (t === "boolean") return "b:" + (value ? "1" : "0");
  if (Array.isArray(value)) return "a[" + value.map(sszLite).join(",") + "]";
  if (t === "object") {
    const o = value as Record<string, unknown>;
    const keys = Object.keys(o).sort();
    const inner = keys.map(k => k + "=" + sszLite(o[k])).join(",");
    return "o{" + inner + "}";
  }
  return "n";
}
export function sszSerialize(value: unknown): Uint8Array {
  return utf8(sszLite(value));
}

/* ---------------------------
 * Public API
 * --------------------------*/
export function canonicalSerialize(value: unknown, algo: CanonicalAlgo = "JCS"): Uint8Array {
  switch (algo) {
    case "CBOR": return cborSerialize(value);
    case "SSZ":  return sszSerialize(value);
    case "JCS":
    default:     return jcsSerialize(value);
  }
}

export function contentHash(value: unknown, algo: CanonicalAlgo = "JCS"): string {
  const bytes = canonicalSerialize(value, algo);
  return sha256Hex(bytes);
}
