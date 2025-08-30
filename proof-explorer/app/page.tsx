"use client";
import { useEffect, useState } from "react";

type ChainItem = {
  jobId: string;
  proofHash: string;
  manifestHash?: string;
  createdAt: number;
  prevHash?: string | null;
  lineHash?: string;
};

type AnchorItem = {
  day: string;
  merkleRoot: string | null;
  leafCount: number;
  file: string | null;
  createdAt: number;
};

const API_BASE = process.env.NEXT_PUBLIC_PRIVORA_API || "http://localhost:4000";

export default function Page() {
  const [chain, setChain] = useState<ChainItem[]>([]);
  const [anchors, setAnchors] = useState<AnchorItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [poll, setPoll] = useState(true);

  async function load() {
    try {
      const [c, a] = await Promise.all([
        fetch(`${API_BASE}/proofs/chain?n=200`).then(r => r.json()),
        fetch(`${API_BASE}/proofs/anchors`).then(r => r.json()),
      ]);
      if (c?.ok) setChain(c.items || []);
      if (a?.ok) setAnchors(a.items || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    if (!poll) return;
    const id = setInterval(load, 10_000); // 10s polling
    return () => clearInterval(id);
  }, [poll]);

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif" }}>
      <h1 style={{ marginBottom: 8 }}>🔐 Privora — Proof Explorer</h1>
      <p style={{ color: "#555", marginTop: 0 }}>
        Live view of hash-chain entries, Merkle roots and daily anchors.
      </p>

      <div style={{ display: "flex", gap: 16, marginTop: 16, flexWrap: "wrap" }}>
        <Card>
          <h3 style={{ marginTop: 0 }}>Merkle Root (Today)</h3>
          <RootCard apiBase={API_BASE} />
        </Card>

        <Card>
          <h3 style={{ marginTop: 0 }}>Anchors (last {anchors.length})</h3>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, maxHeight: 220, overflow: "auto" }}>
            {anchors.slice().reverse().map((a, i) => (
              <li key={i} style={{ marginBottom: 8 }}>
                <div><b>{a.day}</b> • leafs: {a.leafCount}</div>
                <div style={{ fontSize: 12, color: "#666", wordBreak: "break-all" }}>
                  root: {a.merkleRoot || "—"}
                </div>
              </li>
            ))}
            {!anchors.length && <div style={{ color: "#666" }}>No anchors yet.</div>}
          </ul>
        </Card>

        <Card>
          <h3 style={{ marginTop: 0 }}>Controls</h3>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={poll} onChange={e => setPoll(e.target.checked)} />
            Auto-refresh every 10s
          </label>
        </Card>
      </div>

      <Card style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>Hash-Chain (latest {chain.length})</h3>
        {loading ? (
          <div>Loading…</div>
        ) : chain.length ? (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <Th>createdAt</Th>
                <Th>jobId</Th>
                <Th>proofHash</Th>
                <Th>lineHash</Th>
              </tr>
            </thead>
            <tbody>
              {chain.slice().reverse().map((it, idx) => (
                <tr key={idx} style={{ borderTop: "1px solid #eee" }}>
                  <Td>{new Date(it.createdAt).toLocaleString()}</Td>
                  <Td mono>{it.jobId}</Td>
                  <Td mono>{it.proofHash}</Td>
                  <Td mono>{it.lineHash || "—"}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ color: "#666" }}>No proofs yet.</div>
        )}
      </Card>
    </main>
  );
}

function Card(props: React.PropsWithChildren<{ style?: React.CSSProperties }>) {
  return (
    <div style={{
      border: "1px solid #e5e7eb",
      borderRadius: 12,
      padding: 16,
      minWidth: 280,
      ...props.style
    }}>
      {props.children}
    </div>
  );
}

function Th(props: React.PropsWithChildren) {
  return <th style={{ textAlign: "left", fontSize: 12, color: "#666", padding: "6px 4px" }}>{props.children}</th>;
}
function Td(props: React.PropsWithChildren<{ mono?: boolean }>) {
  return <td style={{
    fontSize: 12,
    padding: "6px 4px",
    wordBreak: "break-all",
    fontFamily: props.mono ? "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" : undefined
  }}>{props.children}</td>;
}

function RootCard({ apiBase }: { apiBase: string }) {
  const [root, setRoot] = useState<{ day?: string; leafCount?: number; merkleRoot?: string | null } | null>(null);
  useEffect(() => {
    fetch(`${apiBase}/proofs`).then(r => r.json()).then(j => setRoot(j?.info || null)).catch(() => setRoot(null));
  }, [apiBase]);
  if (!root) return <div>Loading…</div>;
  return (
    <div>
      <div><b>day:</b> {root.day || "—"}</div>
      <div><b>leafs:</b> {root.leafCount ?? 0}</div>
      <div style={{ fontSize: 12, color: "#666", wordBreak: "break-all" }}>
        <b>merkleRoot:</b> {root.merkleRoot || "—"}
      </div>
    </div>
  );
}
