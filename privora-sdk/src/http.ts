type FetchLike = typeof fetch;

export class Http {
  constructor(private baseURL: string, private fetcher: FetchLike = fetch) {}

  async get<T>(path: string): Promise<T> {
    const r = await this.fetcher(this.baseURL + path, { method: "GET" });
    if (!r.ok) throw new Error(`GET ${path} ${r.status}`);
    return r.json() as Promise<T>;
  }

  async postJSON<T>(path: string, body: unknown, headers?: Record<string, string>): Promise<T> {
    const r = await this.fetcher(this.baseURL + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(headers || {}) },
      body: JSON.stringify(body)
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      throw new Error(`POST ${path} ${r.status} ${txt}`);
    }
    return r.json() as Promise<T>;
  }

  base() { return this.baseURL; }
}
