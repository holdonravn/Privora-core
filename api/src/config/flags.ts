// SPDX-License-Identifier: Apache-2.0
// api/src/config/flags.ts
export const FLAGS = {
  batchPolicy: (process.env.BATCH_POLICY || "static") as "static" | "dynamic",
  // Badge / verify cache headers
  badgeCacheTtlSec: Number(process.env.BADGE_CACHE_TTL_SEC || 60),
  badgeStaleWhileRevalidateSec: Number(process.env.BADGE_SWR_SEC || 300),
};
