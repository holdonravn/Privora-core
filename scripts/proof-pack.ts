// SPDX-License-Identifier: Apache-2.0
// scripts/proof-pack.ts
/**
 * Kullanım:
 *  npm run build
 *  node -e "import('./dist/scripts/proof-pack.js').then(m=>m.main('2025-08-24',0))"
 */
import fs from "node:fs";
import path from "node:path";
import archiver from "archiver";

const DATA_DIR = process.env.DATA_DIR || "api/.data";

function outPath(dayISO: string, index: number) {
  return path.join(DATA_DIR, `privora-audit-${dayISO}-${index}.zip`);
}

export async function main(dayISO: string, index: number) {
  const src = path.join(DATA_DIR, `proofs-${dayISO}.ndjson`);
  const rjson = path.join(DATA_DIR, `proofs-${dayISO.replace(/-/g, "")}.root.json`);
  const rtxt = path.join(DATA_DIR, `proofs-${dayISO}.root`);
  const ijson = path.join(DATA_DIR, `proofs-${dayISO.replace(/-/g, "")}.index.json`);
  if (![src, rjson, rtxt, ijson].every(fs.existsSync)) throw new Error("required files missing");

  const dest = outPath(dayISO, index);
  const ws = fs.createWriteStream(dest);
  const zip = archiver("zip", { zlib: { level: 9 } });
  zip.pipe(ws);

  zip.file(src, { name: "leaf/all.ndjson" });
  zip.file(rjson, { name: "merkle/root.json" });
  zip.file(rtxt, { name: "merkle/root.txt" });
  zip.file(ijson, { name: "merkle/index.json" });

  const eas = path.join(DATA_DIR, `eas-${dayISO}.json`);
  const ots = path.join(DATA_DIR, `ots-${dayISO}.ots`);
  if (fs.existsSync(eas)) zip.file(eas, { name: "anchors/eas.json" });
  if (fs.existsSync(ots)) zip.file(ots, { name: "anchors/root.ots" });

  await zip.finalize();
  await new Promise((r) => ws.on("close", r));
  console.log("[audit] saved:", dest);
}

if (process.argv[1]?.includes("proof-pack")) {
  const day = process.argv[2];
  const idx = Number(process.argv[3] ?? 0);
  main(day, idx).catch((e) => { console.error(e); process.exit(1); });
}
