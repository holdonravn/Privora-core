import { canonicalStringify } from "./canonical.js";
import { Http } from "./http.js";
import { canonicalToSign, hmac256Hex } from "./sign.js";

export type PrivoraClientOpts = {
  baseURL?: string;                 // e.g. http://localhost:4000
  keyId?: string;                   // for HMAC (internal endpoints)
  hmacSecret?: string;              // for HMAC (internal endpoints)
  fetch?: typeof fetch;             // override for tests
};

export class PrivoraClient {
  private http: Http;
  private keyId?: string;
  private secret?: string;

  constructor(opts: PrivoraClientOpts = {}) {
    const base = opts.baseURL || process.env.PRIVORA_API || "http://localhost:4000";
    this.http = new Http(base, opts.fetch || fetch);
    this.keyId = opts.keyId || process.env.PRIVORA_KEY_ID || undefined;
    this.secret = opts.hmacSecret || process.env.PRIVORA_HMAC_SECRET || undefined;
  }

  // ---------- Public: submit & read proofs ----------
  /** Deterministic JSON + SHA-256 server-side; returns jobId */
  async submit(payload: unknown): Promise<{ ok: boolean; jobId: string }> {
    const canon = canonicalStringify(payload);
    // İstersen client-side hash hesaplayıp da gönderebilirsin; MVP olarak server halleder.
    return this.http.postJSON("/submit", { payload: JSON.parse(canon) });
  }

  /** { day, leafCount, merkleRoot, file } */
  async getRoot(): Promise<{ ok: boolean; info: { day?: string; leafCount: number; merkleRoot: string | null; file: string | null } }> {
    return this.http.get("/proofs");
  }

  /** verify inclusion proof (if branch logic exposed) */
  async verifyProof(opts: { leaf: string; root: string; branch: any[] }) {
    const q = new URLSearchParams({
      leaf: opts.leaf,
      root: opts.root,
      branch: JSON.stringify(opts.branch)
    });
    return this.http.get(`/proofs/verify?${q.toString()}`);
  }

  // ---------- Optional: HMAC-protected internal endpoints ----------
  /** next-job (requires HMAC) */
  async nextJob(): Promise<{ ok: boolean; job: { id: string; payload: unknown } | null }> {
    const { headers, path, body } = this.signed("/next-job", {});
    return this.http.postJSON(path, body, headers);
  }

  /** append proof line (requires HMAC) */
  async appendProof(input: { jobId: string; proofHash: string; manifestHash?: string }) {
    const { headers, path, body } = this.signed("/proof", input);
    return this.http.postJSON(path, body, headers);
  }

  // ---------- HMAC helper ----------
  private signed(path: string, body: unknown) {
    if (!this.secret) throw new Error("hmacSecret not configured");
    const raw = Buffer.from(JSON.stringify(body) || "");
    const ts = String(Date.now());
    const nonce = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    const canon = canonicalToSign({
      method: "POST",
      path,
      rawBody: raw,
      ts,
      nonce,
    });
    const sig = hmac256Hex(this.secret, canon);
    const headers = {
      "x-key-id": this.keyId || "default",
      "x-ts": ts,
      "x-nonce": nonce,
      "x-signature-256": sig,
    };
    return { headers, path, body };
  }
}

// Quick helper exports
export { canonicalStringify } from "./canonical.js";
