import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { env } from "@/env";
import { can } from "@/lib/permissions";
import { loadCtx } from "@/server/context";
import { sameOrigin } from "@/server/http";

const MAX = 2 * 1024 * 1024;

/** Identify by magic bytes, never by the client-supplied type or name. */
function sniff(b: Buffer): "png" | "jpg" | "webp" | null {
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.length > 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const ctx = await loadCtx();
  if (!ctx || !(can(ctx.role, "products:write") || can(ctx.role, "settings:manage"))) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: "Image must be 2 MB or smaller" }, { status: 413 });
  const buf = Buffer.from(await file.arrayBuffer());
  const ext = sniff(buf);
  if (!ext) return NextResponse.json({ error: "Only PNG, JPG or WebP images are allowed" }, { status: 415 });
  const name = `${randomBytes(16).toString("hex")}.${ext}`;
  const dir = path.resolve(env.UPLOAD_DIR);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), buf, { flag: "wx" });
  return NextResponse.json({ url: `/api/files/${name}` });
}
