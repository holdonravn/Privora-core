import { PrivoraClient } from "privora-sdk";

async function main() {
  const client = new PrivoraClient({ baseURL: "http://localhost:4000" });

  const { jobId } = await client.submit({ userId: "u1", action: "score", n: 42 });
  const root = await client.getRoot();
  console.log(jobId, root);
}

main().catch(console.error);
