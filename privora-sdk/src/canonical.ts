// Deterministic JSON (JCS-ish): keys sorted, NFC strings, drop undefined
export function canonicalStringify(value: unknown): string {
  const seen = new WeakSet();

  const norm = (v: unknown): unknown => {
    if (v === null) return null;
    const t = typeof v;
    if (t === "string") return (v as string).normalize("NFC");
    if (t === "number") {
      if (!Number.isFinite(v as number)) throw new Error("non-finite number");
      return v;
    }
    if (t === "boolean") return v;
    if (t === "bigint") return (v as bigint).toString();
    if (t === "object") {
      const obj = v as Record<string, unknown>;
      if (seen.has(obj as object)) throw new Error("circular structure");
      seen.add(obj as object);
      if (Array.isArray(obj)) return obj.map(norm);
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(obj).sort()) {
        const val = (obj as any)[k];
        if (typeof val === "undefined") continue;
        out[k] = norm(val);
      }
      return out;
    }
    return null; // drop others
  };

  return JSON.stringify(norm(value));
}
