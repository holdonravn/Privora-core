// SPDX-License-Identifier: Apache-2.0
// api/src/store/proof-store.ts
import fs from "node:fs";
import path from "node:path";
import { once } from "node:events";
import { MerkleBranch, sha256Buf, merklePath, merkleRoot } from "../crypto/merkle";

export type ProofLine = {
  jobId: string;
  proofHash: string;        // 0x...
  manifestHash?: string;    // 0x...
  createdAt: number;        // ms epoch
};

type WriterState = {
  stream: fs.WriteStream;
  bytes: number;
  dayKey: string;          // YYYYMMDD
  leafOffsets: number[];
};

function ensureDir(dir: string) { fs.mkdirSync(dir, { recursive: true }); }
function dayKeyFrom(ts: number): string {
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

export class ProofStore {
  dir: string;
  maxBytes: number;
  writer?: WriterState;
  leaves: Buffer[] = [];

  constructor(dir: string, opts?: { maxBytes?: number }) {
    this.dir = dir;
    this.maxBytes = opts?.maxBytes ?? 50 * 1024 * 1024;
    ensureDir(this.dir);
    this.rotateIfNeeded(Date.now());
  }

  currentNdjsonPath(dayKey: string) { return path.join(this.dir, `proofs-${dayKey}.ndjson`); }
  currentRootPath(dayKey: string)    { return path.join(this.dir, `proofs-${dayKey}.root.json`); }
  currentIndexPath(dayKey: string)   { return path.join(this.dir, `proofs-${dayKey}.index.json`); }

  private openWriter(dayKey: string) {
    const f = this.currentNdjsonPath(dayKey);
    const stream = fs.createWriteStream(f, { flags: "a", encoding: "utf8" });
    const bytes = fs.existsSync(f) ? fs.statSync(f).size : 0;
    this.writer = { stream, bytes, dayKey, leafOffsets: [] };

    // restore previous leaves (if any)
    const idx = this.currentIndexPath(dayKey);
    this.leaves = [];
    if (fs.existsSync(idx)) {
      try {
        const prev = JSON.parse(fs.readFileSync(idx, "utf8")) as { leaves: string[] };
        for (const hx of prev.leaves) this.leaves.push(Buffer.from(hx.slice(2), "hex"));
      } catch {}
    }
  }

  private rotateIfNeeded(ts: number) {
    const dk = dayKeyFrom(ts);
    if (!this.writer) return this.openWriter(dk);
    const needDayRotate = this.writer.dayKey !== dk;
    const needSizeRotate = this.writer.bytes >= this.maxBytes;
    if (needDayRotate || needSizeRotate) { this.closeWriter(); this.openWriter(dk); }
  }

  private flushRootAndIndex() {
    if (!this.writer) return;
    const dayKey = this.writer.dayKey;
    const rootPath = this.currentRootPath(dayKey);
    const indexPath = this.currentIndexPath(dayKey);
    const rootJson = {
      day: dayKey,
      leafCount: this.leaves.length,
      merkleRoot: ("0x" + merkleRoot(this.leaves).toString("hex")),
      updatedAt: Date.now()
    };
    fs.writeFileSync(rootPath, JSON.stringify(rootJson, null, 2), "utf8");
    const leafHexes = this.leaves.map(buf => ("0x" + buf.toString("hex")));
    fs.writeFileSync(indexPath, JSON.stringify({ day: dayKey, leaves: leafHexes }, null, 0), "utf8");
  }

  private async _appendJsonLineAndHash(obj: unknown, ts: number) {
    this.rotateIfNeeded(ts);
    if (!this.writer) throw new Error("writer not initialized");

    const json = JSON.stringify(obj) + "\n";
    const ok = this.writer.stream.write(json);
    this.writer.bytes += Buffer.byteLength(json);
    if (!ok) await once(this.writer.stream, "drain");

    const leaf = sha256Buf(json);
    this.leaves.push(leaf);

    if (this.leaves.length % 100 === 0) this.flushRootAndIndex();
  }

  /** Orijinal proof satırı (geriye dönük uyumluluk) */
  async append(line: ProofLine) {
    const ts = line.createdAt || Date.now();
    await this._appendJsonLineAndHash(line, ts);
  }

  /** GENEL AMAÇLI append — correction/dispute/history kayıtları için */
  async appendAny(obj: Record<string, unknown>) {
    const ts = Number(obj?.["createdAt"] ?? obj?.["openedAt"] ?? obj?.["updatedAt"] ?? Date.now());
    await this._appendJsonLineAndHash(obj, ts);
  }

  currentRoot() {
    if (!this.writer) return null;
    return {
      day: this.writer.dayKey,
      leafCount: this.leaves.length,
      merkleRoot: ("0x" + merkleRoot(this.leaves).toString("hex")),
      file: path.basename(this.currentNdjsonPath(this.writer.dayKey)),
    };
  }

  getPath(dayKey: string, index: number): { branch: MerkleBranch; root: `0x${string}` } | null {
    const idxPath = this.currentIndexPath(dayKey);
    if (!fs.existsSync(idxPath)) return null;
    const { leaves } = JSON.parse(fs.readFileSync(idxPath, "utf8")) as { leaves: string[] };
    const bufs = leaves.map((h) => Buffer.from(h.slice(2), "hex"));
    if (index < 0 || index >= bufs.length) return null;
    const branch = merklePath(bufs, index);
    const root = ("0x" + merkleRoot(bufs).toString("hex")) as `0x${string}`;
    return { branch, root };
  }
}
