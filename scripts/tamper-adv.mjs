// SPDX-License-Identifier: Apache-2.0
// scripts/tamper-adv.mjs
import fs from "node:fs";
import crypto from "node:crypto";
import sharp from "sharp";

function sha256Hex(buf) { return "0x" + crypto.createHash("sha256").update(buf).digest("hex"); }

function bits(x) { return [...x].map(c => c.charCodeAt(0)); }
function hamming(a, b) { let d = 0; for (let i=0;i<a.length;i++) d += (a[i]^b[i]).toString(2).split("1").length-1; return d; }

async function aHashHex(buf) {
  const img = await sharp(buf).resize(8,8,{fit:"fill"}).greyscale().raw().toBuffer();
  const avg = img.reduce((s,v)=>s+v,0)/img.length;
  let r = ""; for (const v of img) r += v>avg ? "\xff" : "\x00"; return r;
}
async function dHashHex(buf) {
  const w=9,h=8; const img = await sharp(buf).resize(w,h,{fit:"fill"}).greyscale().raw().toBuffer();
  let r=""; for (let y=0;y<h;y++){ for (let x=0;x<w-1;x++){ const i=y*w+x; r+= img[i]>img[i+1] ? "\xff" : "\x00"; } } return r;
}

async function variant(name, fn){ try { return { name, buf: await fn() }; } catch(e){ console.warn("variant fail", name, e.message); return null; } }

async function main() {
  const file = process.argv[2];
  if (!file || !fs.existsSync(file)) { console.error("Kullanım: node scripts/tamper-adv.mjs ./sample.jpg"); process.exit(1); }
  const src = fs.readFileSync(file);
  const a0 = await aHashHex(src); const d0 = await dHashHex(src);

  const vars = (await Promise.all([
    variant("crop-center",   async()=> await sharp(src).extract({left:10,top:10,width:Math.max(1,(await sharp(src).metadata()).width-20),height:Math.max(1,(await sharp(src).metadata()).height-20)}).toBuffer()),
    variant("color-jitter",  async()=> await sharp(src).modulate({saturation:1.3, brightness:1.1}).toBuffer()),
    variant("blur-1",        async()=> await sharp(src).blur(1).toBuffer()),
    variant("rotate-5",      async()=> await sharp(src).rotate(5, {background:"#000"}).toBuffer()),
    variant("jpeg-80",       async()=> await sharp(src).jpeg({quality:80}).toBuffer()),
  ])).filter(Boolean);

  console.log("orijinal", { sha256: sha256Hex(src) });

  for (const v of vars) {
    const a1 = await aHashHex(v.buf);
    const d1 = await dHashHex(v.buf);
    console.log(v.name, {
      sha256: sha256Hex(v.buf),
      aHamming: hamming(bits(a0), bits(a1)),
      dHamming: hamming(bits(d0), bits(d1)),
    });
  }
}
main().catch(console.error);
