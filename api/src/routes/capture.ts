import { Router } from "express";
import crypto from "node:crypto";
import { store } from "../state.js";
import { requireFreshTs } from "../mw/requireFreshTs.js";
import { requireHmac } from "../mw/requireHmac.js";

// Sıralı/kararlı JSON (HMAC ile aynı mantık)
function stableStringify(x: unknown): string {
  if (x === null || typeof x !== "object") return JSON.stringify(x);
  if (Array.isArray(x)) return "[" + x.map(stableStringify).join(",") + "]";
  const o = x as Record<string, unknown>;
  const keys = Object.keys(o).sort();
  return "{" + keys.map(k => JSON.stringify(k) + ":" + stableStringify(o[k])).join(",") + "}";
}
const sha256Hex = (s: string) => ("0x" + crypto.createHash("sha256").update(s).digest("hex")) as `0x${string}`;

const r = Router();

/**
 * POST /capture-proof
 * Body örneği:
 * {
 *   "content": {...} | "raw": "string|bytes(hex)",
 *   "contentType": "media|llm-output",
 *   "modelHash": "0x..", "contextHash": "0x..", "outputHash": "0x..",
 *   "perceptual": {"pHash":"...", "aHash":"...", "dHash":"..."},
 *   "c2pa": {"present": true, "valid": true, "manifestCid":"ipfs://..."},
 *   "attestation": {"tee":"nitro|sgx", "quoteHash":"0x.."}
 * }
 */
r.post("/capture-proof", requireFreshTs(), requireHmac(), async (req, res) => {
  const b = req.body ?? {};
  const content = b.content ?? b.raw ?? null;
  if (!content) return res.status(400).json({ ok: false, error: "missing-content" });

  const contentId = sha256Hex(stableStringify(content));
  // Proof materyalini deterministik biçimde özetliyoruz (LLM & media ortak)
  const material = {
    contentType: b.contentType ?? "unknown",
    modelHash: b.modelHash ?? null,
    contextHash: b.contextHash ?? null,
    outputHash: b.outputHash ?? null,
    perceptual: b.perceptual ?? null,
    c2pa: b.c2pa ?? null,
    attestation: b.attestation ?? null,
  };
  const proofHash = sha256Hex(stableStringify(material));

  await store.append({
    jobId: String(contentId),            // içerik kimliği
    proofHash: proofHash,                // materyal hash’i
    manifestHash: b.manifestHash ?? undefined,
    createdAt: Date.now(),
  });

  return res.json({
    ok: true,
    contentId,
    proofHash,
    info: {
      materialIncluded: !!material,
      day: store.currentRoot()?.day ?? null,
    }
  });
});

export default r;
