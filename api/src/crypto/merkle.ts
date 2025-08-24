// SPDX-License-Identifier: Apache-2.0
// api/src/crypto/merkle.ts
import crypto from "node:crypto";

export function sha256Buf(data: Buffer | string): Buffer {
  const d = typeof data === "string" ? Buffer.from(data) : data;
  return crypto.createHash("sha256").update(d).digest();
}
export function sha256Hex(data: Buffer | string): `0x${string}` {
  return ("0x" + sha256Buf(data).toString("hex")) as `0x${string}`;
}

export function merkleRoot(leaves: Buffer[]): Buffer {
  if (leaves.length === 0) return Buffer.alloc(32);
  let level = leaves.slice();
  while (level.length > 1) {
    const next: Buffer[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const L = level[i];
      const R = i + 1 < level.length ? level[i + 1] : L;
      next.push(sha256Buf(Buffer.concat([L, R])));
    }
    level = next;
  }
  return level[0];
}

export type MerkleBranch = { hash: `0x${string}`; side: "L" | "R" }[];
export function merklePath(leaves: Buffer[], index: number): MerkleBranch {
  let level = leaves.slice();
  let idx = index;
  const branch: MerkleBranch = [];
  while (level.length > 1) {
    const isRight = idx % 2 === 1;
    const pairIdx = isRight ? idx - 1 : idx + 1;
    const sibling = pairIdx < level.length ? level[pairIdx] : level[idx];
    branch.push({
      hash: ("0x" + sibling.toString("hex")) as `0x${string}`,
      side: isRight ? "L" : "R",
    });
    const next: Buffer[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const L = level[i];
      const R = i + 1 < level.length ? level[i + 1] : L;
      next.push(sha256Buf(Buffer.concat([L, R])));
    }
    level = next;
    idx = Math.floor(idx / 2);
  }
  return branch;
}

export function verifyMerkleProof(
  leaf: `0x${string}`,
  branch: MerkleBranch,
  expectedRoot: `0x${string}`
): boolean {
  let acc = Buffer.from(leaf.slice(2), "hex");
  for (const step of branch) {
    const sib = Buffer.from(step.hash.slice(2), "hex");
    const pair =
      step.side === "L" ? Buffer.concat([sib, acc]) : Buffer.concat([acc, sib]);
    acc = sha256Buf(pair);
  }
  return "0x" + acc.toString("hex") === expectedRoot;
}
