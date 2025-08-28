// SPDX-License-Identifier: Apache-2.0
import { Router } from "express";
import { asyncH } from "../mw/async.js";
import { requireFreshTs } from "../mw/requireFreshTs.js";
import { requireHmac } from "../mw/requireHmac.js";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DATA_DIR = process.env.DATA_DIR || ".data";
const FHE_LOG = path.join(DATA_DIR, "fhe-events.ndjson");

const OpEnum = z.enum([
  "encrypt", "decrypt",
  "op:add", "op:mul", "op:sub", "op:neg", "op:rot", "op:bootstrap",
  "circuit:create", "circuit:exec",
]);

const FheEventSchema = z.object({
  operationId: z.string().min(8),
  userWallet: z.string().min(1),
  fieldName: z.string().min(1),
  op: OpEnum,
  ciphertextSize: z.number().int().nonnegative().optional(),
  schemaVer: z.number().int().min(1),
  keyVer: z.string().optional(),
  metadata: z.object({
    scheme: z.string().min(1),
    securityLevel: z.string().optional(),
    noiseLevel: z.number().optional(),
    bootstrappable: z.boolean().optional(),
    version: z.string().optional(),
    timestamp: z.number().int().optional(),
  }).partial().passthrough().optional(),
  chain: z.object({
    chainId: z.string().optional(),
    txHash: z.string().optional(),
    contract: z.string().optional(),
  }).partial().optional(),
});

export default function fheRoutes() {
  const r = Router();

  r.post("/fhe/ingest", requireFreshTs(), requireHmac(), asyncH(async (req, res) => {
    const parsed = FheEventSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: "bad-schema",
        details: parsed.error.issues
      });
    }

    const ev = parsed.data;
    await fs.promises.mkdir(DATA_DIR, { recursive: true });

    const lineObj = { t: "fhe", at: Date.now(), ...ev };
    const line = JSON.stringify(lineObj);
    await fs.promises.appendFile(FHE_LOG, line + "\n", { flag: "a" });

    const leafHash = crypto.createHash("sha256").update(line).digest("hex");
    return res.json({ ok: true, leafHash });
  }));

  return r;
}
