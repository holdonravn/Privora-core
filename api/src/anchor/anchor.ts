// SPDX-License-Identifier: Apache-2.0
// api/src/anchor/anchor.ts
import { anchorOk, anchorFail } from "../metrics.js";

/** Minimal pluggable anchor: webhook veya EVM (opsiyonel). */
export async function anchorRoot(meta: {
  day: string;
  merkleRoot: string | null;
  leafCount: number;
}) {
  if (!process.env.ANCHOR_ENABLE || process.env.ANCHOR_ENABLE === "false") return;

  try {
    const root = meta.merkleRoot;
    if (!root) return;

    // 1) Webhook (varsayılan)
    const hook = process.env.ANCHOR_WEBHOOK_URL;
    if (hook) {
      // eslint-disable-next-line no-undef
      const fetchFn = (await import("node-fetch")).default as any;
      const r = await fetchFn(hook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "anchor", ...meta }),
      });
      if (!r.ok) throw new Error(`webhook ${r.status}`);
      anchorOk.inc();
      return;
    }

    // 2) EVM (opsiyonel)
    const rpc = process.env.ANCHOR_RPC_URL;
    const pk = process.env.ANCHOR_PRIVATE_KEY;
    const addr = process.env.ANCHOR_CONTRACT_ADDRESS;
    if (rpc && pk && addr) {
      const { ethers } = await import("ethers");
      const abi = [
        "function anchor(bytes32 root, string day, uint256 leafCount) public",
      ];
      const provider = new ethers.JsonRpcProvider(rpc);
      const wallet = new ethers.Wallet(pk, provider);
      const c = new ethers.Contract(addr, abi, wallet);
      const tx = await c.anchor(root, meta.day, BigInt(meta.leafCount));
      await tx.wait();
      anchorOk.inc();
      return;
    }

    // No target configured → noop
  } catch (e) {
    anchorFail.inc();
    // eslint-disable-next-line no-console
    console.error("[anchor] failed", e);
  }
}
