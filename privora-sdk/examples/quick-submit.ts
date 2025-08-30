import { submitProof } from "privora-sdk";

async function main() {
  const proof = await submitProof({ user: "123", tx: "abc" });
  console.log("Proof submitted:", proof);
}

main().catch(console.error);
