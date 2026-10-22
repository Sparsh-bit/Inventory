import { mkdir, rm, writeFile } from "node:fs/promises";
import { MongoClient } from "mongodb";
import { E2E_ENV } from "../playwright.config";
import { startMockNic } from "../scripts/mock-nic.mjs";

export const MOCK_NIC_PORT = 4555;

/** Fresh database and mailbox for every run, plus a mock GST e-invoice API. */
export default async function globalSetup() {
  const client = new MongoClient(E2E_ENV.MONGODB_URI);
  await client.connect();
  await client.db().dropDatabase();
  await client.close();
  await rm(".data/mail.log", { force: true });
  const nic = await startMockNic(MOCK_NIC_PORT);
  await mkdir(".data", { recursive: true });
  await writeFile(".data/mock-nic.pem", nic.publicKey);
  return () => nic.close();
}
