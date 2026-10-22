import { readFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/env";
import { loadCtx } from "@/server/context";

const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };

export async function GET(_req: Request, { params }: RouteContext<"/api/files/[name]">) {
  const { name } = await params;
  const m = /^([a-f0-9]{32})\.(png|jpg|webp)$/.exec(name); // strict pattern = no path traversal
  if (!m) return new Response("Not found", { status: 404 });
  if (!(await loadCtx())) return new Response("Unauthorized", { status: 401 });
  try {
    const data = await readFile(path.join(path.resolve(env.UPLOAD_DIR), name));
    return new Response(new Uint8Array(data), {
      headers: { "Content-Type": TYPES[m[2]], "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
