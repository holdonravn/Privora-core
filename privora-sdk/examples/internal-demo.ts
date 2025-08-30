const client = new PrivoraClient({
  baseURL: "http://localhost:4000",
  keyId: "default",
  hmacSecret: process.env.PRIVORA_HMAC_SECRET as string
});

const job = await client.nextJob();
if (job.job) {
  // hesapladığın proofHash’i kaydet
  await client.appendProof({ jobId: job.job.id, proofHash: "0xabc..." });
}
