// SPDX-License-Identifier: Apache-2.0
// load/k6/verify-status.js
import http from "k6/http";
import { check, sleep } from "k6";

export let options = {
  vus: 200,
  duration: "3m",
  thresholds: {
    http_req_failed:  ["rate<0.01"],
    http_req_duration:["p(95)<150"],
  },
};

function randomId() {
  return Math.random().toString(16).slice(2);
}

export default function () {
  const api = __ENV.API || "http://localhost:4000";
  // Yarısı gerçekçi, yarısı cache miss senaryosu
  const contentId = Math.random() < 0.5 ? `cid_known_${(Date.now()/1000|0) % 5}` : `cid_unknown_${randomId()}`;
  const url = `${api}/verify/status?contentId=${contentId}`;
  const res = http.get(url);
  check(res, { "200/ok": (r) => r.status === 200 });
  sleep(0.1);
}
