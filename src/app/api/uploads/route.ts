import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { env } from "@/env";
import { can } from "@/lib/permissions";
import { loadCtx } from "@/server/context";
import { sameOrigin } from "@/server/http";

const MAX_IMAGE = 2 * 1024 * 1024;
const MAX_DOC = 10 * 1024 * 1024;

/** Identify by magic bytes, never by the client-supplied type or name. */
function sniff(b: Buffer): "png" | "jpg" | "webp" | "pdf" | null {
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.length > 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return "webp";
  if (b.length > 5 && b.toString("ascii", 0, 5) === "%PDF-") return "pdf";
  return null;
}

/**
 * kind=image (default): product images and logos, PNG/JPG/WebP up to 2 MB.
 * kind=doc: supplier bills and receipts (images or PDF up to 10 MB), stored per business and
 * served only to that business (/api/docs).
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const ctx = await loadCtx();
  const form = await req.formData().catch(() => null);
  const doc = form?.get("kind") === "doc";
  const allowed = ctx && (doc ? can(ctx.role, "purchases:write") : can(ctx.role, "products:write") || can(ctx.role, "settings:manage"));
  if (!ctx || !allowed) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
  const max = doc ? MAX_DOC : MAX_IMAGE;
  if (file.size > max) return NextResponse.json({ error: `File must be ${max / 1024 / 1024} MB or smaller` }, { status: 413 });
  const buf = Buffer.from(await file.arrayBuffer());
  const ext = sniff(buf);
  if (!ext || (!doc && ext === "pdf")) return NextResponse.json({ error: doc ? "Only photos (PNG, JPG, WebP) or PDF files are allowed" : "Only PNG, JPG or WebP images are allowed" }, { status: 415 });
  const name = `${randomBytes(16).toString("hex")}.${ext}`;
  const dir = doc ? path.resolve(env.UPLOAD_DIR, "docs", ctx.orgId) : path.resolve(env.UPLOAD_DIR);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), buf, { flag: "wx" });
  if (!doc) return NextResponse.json({ url: `/api/files/${name}` });
  const original = file.name.replace(/[^\w.\- ()]/g, "_").slice(0, 120) || name;
  return NextResponse.json({ url: `/api/docs/${name}`, name: original, type: ext, size: buf.length });
}
