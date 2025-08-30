import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export function sha256Hex(buf: Buffer | string): string {
  return createHash("sha256").update(buf).digest("hex");
}

export function hmac256Hex(secret: string, data: string): string {
  return createHmac("sha256", secret).update(data).digest("hex");
}

export function tEqHex(a: string, b: string) {
  const A = Buffer.from(a, "hex");
  const B = Buffer.from(b, "hex");
  return A.length === B.length && timingSafeEqual(A, B);
}

/** Canonical string: METHOD\nPATH\nSHA256(rawBody)\nX-TS\nX-NONCE */
export function canonicalToSign(opts: {
  method: string;
  path: string;
  rawBody: Buffer;
  ts: string;
  nonce: string;
}) {
  const bodyHash = sha256Hex(opts.rawBody);
  return [opts.method.toUpperCase(), opts.path, bodyHash, opts.ts, opts.nonce].join("\n");
}
