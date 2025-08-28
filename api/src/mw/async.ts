// SPDX-License-Identifier: Apache-2.0
// api/src/mw/async.ts
import type { RequestHandler } from "express";
export const asyncH = (fn: any): RequestHandler => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
