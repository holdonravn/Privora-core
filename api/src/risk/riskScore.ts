// SPDX-License-Identifier: Apache-2.0
// api/src/risk/riskScore.ts
interface Inputs {
  reqRatePerMin?: number;
  hmacFailRate?: number;
  dupProofs?: number;
  payloadSize?: number;
}

/** 0–100 basit risk skoru */
export function riskScore(i: Inputs): number {
  let s = 0;
  if ((i.reqRatePerMin ?? 0) > 120) s += 40;
  if ((i.hmacFailRate ?? 0) > 0.05) s += 35;
  if ((i.dupProofs ?? 0) > 2) s += 15;
  if ((i.payloadSize ?? 0) > 256 * 1024) s += 20;
  return Math.min(100, s);
}
