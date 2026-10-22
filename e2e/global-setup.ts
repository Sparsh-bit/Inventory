import { rm } from "node:fs/promises";
import { MongoClient } from "mongodb";
import { E2E_ENV } from "../playwright.config";

/** Fresh database and mailbox for every run. */
export default async function globalSetup() {
  const client = new MongoClient(E2E_ENV.MONGODB_URI);
  await client.connect();
  await client.db().dropDatabase();
  await client.close();
  await rm(".data/mail.log", { force: true });
}
