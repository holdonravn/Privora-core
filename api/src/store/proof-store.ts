// ============================================================================
// SPDX-License-Identifier: Apache-2.0
// File: api/src/store/proof-store.ts
// NDJSON store: header (ver), hash-chain (prevHash/lineHash), basit root snapshot
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import crypto from "node:crypto";

export type ProofLine = {
  jobId: string;
  proofHash: string;
  manifestHash?: string;
  createdAt: number;
  // aşağıdakiler otomatik doldurulur
  prevHash?: string | null;
  lineHash?: string;
};

type RootSnap = { day: string; leafCount: number; merkleRoot: string | null; file: string | null };

export class ProofStore {
  public currentFilePath: string;
  private dir: string;
  private lastHash: string | null = null;
  private leafs: string[] = [];
  private day: string;

  constructor(dir: string) {
    this.dir = dir;
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    this.day = new Date().toISOString().slice(0,10);
    this.currentFilePath = path.join(this.dir, `proofs-${this.day}.ndjson`);
    void this.ensureHeader(this.currentFilePath);
    void this.recoverState(this.currentFilePath);
  }

  private sha(s: string) { return crypto.createHash("sha256").update(s).digest("hex"); }

  private async fsStatSafe(fp: string) {
    try { return await fs.promises.stat(fp); } catch { return { size: 0 } as fs.Stats; }
  }

  private async appendRaw(fp: string, text: string) {
    await fs.promises.appendFile(fp, text);
  }

  private async ensureHeader(fp: string) {
    const st = await this.fsStatSafe(fp);
    if (st.size > 0) return;
    const hdr = {
      t: "header",
      ver: 1,
      createdAt: Date.now(),
      leafHashAlg: (process.env.MERKLE_LEAF_HASH || "sha256").toLowerCase(),
      fileFormat: "ndjson",
    };
    const raw = JSON.stringify(hdr) + "\n";
    await this.appendRaw(fp, raw);
    this.lastHash = this.sha(JSON.stringify(hdr));
  }

  private async recoverState(fp: string) {
    if (!fs.existsSync(fp)) return;
    const rl = readline.createInterface({ input: fs.createReadStream(fp) });
    let last: string | null = null;
    for await (const raw of rl) {
      const line = raw.trim();
      if (!line) continue;
      const obj = JSON.parse(line);
      if (obj.t === "header") {
        this.lastHash = this.sha(JSON.stringify(obj));
        continue;
      }
      last = line;
      if (obj.proofHash) this.leafs.push(obj.proofHash);
      this.lastHash = obj.lineHash || this.sha((this.lastHash || "") + line);
    }
    if (!this.lastHash) await this.ensureHeader(fp);
  }

  private rotateIfNeeded() {
    const d = new Date().toISOString().slice(0,10);
    if (d !== this.day) {
      this.day = d;
      this.currentFilePath = path.join(this.dir, `proofs-${this.day}.ndjson`);
      this.lastHash = null;
      this.leafs = [];
      void this.ensureHeader(this.currentFilePath);
      void this.recoverState(this.currentFilePath);
    }
  }

  async append(line: ProofLine) {
    this.rotateIfNeeded();
    const rawBase = JSON.stringify({
      jobId: line.jobId,
      proofHash: line.proofHash,
      manifestHash: line.manifestHash,
      createdAt: line.createdAt,
    });
    const lineHash = this.sha((this.lastHash || "") + rawBase);
    const chained = { ...JSON.parse(rawBase), prevHash: this.lastHash, lineHash };
    await this.appendRaw(this.currentFilePath, JSON.stringify(chained) + "\n");
    this.lastHash = lineHash;
    this.leafs.push(line.proofHash);
  }

  currentRoot(): RootSnap {
    // minimal merkle: yaprakları hash’leyip katmanlı indirgeme (sha256)
    const h = (s: string) => this.sha(s);
    let nodes = this.leafs.map(h);
    if (nodes.length === 0) return { day: this.day, leafCount: 0, merkleRoot: null, file: this.currentFilePath };
    while (nodes.length > 1) {
      const next: string[] = [];
      for (let i=0; i<nodes.length; i+=2) {
        if (i+1 < nodes.length) next.push(h(nodes[i] + nodes[i+1]));
        else next.push(nodes[i]);
      }
      nodes = next;
    }
    return { day: this.day, leafCount: this.leafs.length, merkleRoot: nodes[0], file: this.currentFilePath };
  }
}
