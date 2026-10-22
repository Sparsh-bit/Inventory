import { execFileSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { toBuffer } from "bwip-js/node";
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
  await makeFakeWebcam();
  return () => nic.close();
}

/**
 * A fake webcam video of a real EAN-13 barcode (sample product "Mineral Water 1L"), used by the
 * camera-scanning test. Skipped quietly when ffmpeg is not installed.
 */
async function makeFakeWebcam() {
  const png = await toBuffer({ bcid: "ean13", text: "8901234567890", scale: 4, height: 22, includetext: true, paddingwidth: 40, paddingheight: 30, backgroundcolor: "FFFFFF" });
  await writeFile(".data/barcode.png", png);
  try {
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-loop", "1", "-i", ".data/barcode.png", "-t", "4", "-r", "15",
      "-vf", "scale=640:480:force_original_aspect_ratio=decrease,pad=640:480:(ow-iw)/2:(oh-ih)/2:white,format=yuv420p", ".data/fake-webcam.y4m"]);
  } catch {
    await rm(".data/fake-webcam.y4m", { force: true });
  }
}
