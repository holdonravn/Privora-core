// SPDX-License-Identifier: Apache-2.0
// api/public/badge.js
(function () {
  const API_BASE = (document.currentScript && document.currentScript.dataset?.api) || "";

  function el(tag, attrs = {}, children = []) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "style") Object.assign(e.style, v);
      else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    }
    children.forEach(c => e.appendChild(typeof c === "string" ? document.createTextNode(c) : c));
    return e;
  }

  function renderBadge(container, data) {
    const level = data?.level || "grey";
    const bg = level === "green" ? "#16a34a" : level === "amber" ? "#f59e0b" : "#6b7280";
    const label = level === "green" ? "Verified" : level === "amber" ? "Check" : "Unverified";
    const tooltip = [
      `Level: ${level}`,
      data?.proof?.contentId ? `contentId: ${data.proof.contentId}` : null,
      data?.onChain?.dayRoot ? `root: ${data.onChain.dayRoot}` : null,
    ].filter(Boolean).join("\n");

    const badge = el("a",
      { href: data?.verifyUrl || "#", target: "_blank", rel: "noopener", title: tooltip, style: {
        display:"inline-flex", alignItems:"center", gap:"6px", padding:"6px 10px",
        borderRadius:"999px", color:"#fff", background:bg, fontFamily:"ui-sans-serif,system-ui",
        fontSize:"12px", textDecoration:"none"
      }},
      [
        el("span", { style:{width:"10px", height:"10px", display:"inline-block", background:"#fff", borderRadius:"50%"} }),
        el("strong", {}, [label]),
      ]
    );
    container.innerHTML = "";
    container.appendChild(badge);
  }

  async function init() {
    const nodes = document.querySelectorAll("[data-privora-proof]");
    for (const node of nodes) {
      const proofId = node.getAttribute("data-privora-proof");
      const api = node.getAttribute("data-privora-api") || API_BASE || "";
      const url = `${api.replace(/\/+$/,"")}/verify/status?proofId=${encodeURIComponent(proofId)}`;
      try {
        const res = await fetch(url); const data = await res.json();
        renderBadge(node, data);
      } catch { renderBadge(node, { level: "grey" }); }
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
