import path from "node:path";
import { readFile } from "node:fs/promises";
import { env } from "@/env";
import { loadCtx } from "@/server/context";

const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };

export async function GET(_req: Request, { params }: RouteContext<"/api/org-files/[orgId]/[name]">) {
  const { orgId, name } = await params;
  const match = /^([a-f0-9]{24})\/([a-f0-9]{32})\.(png|jpg|webp)$/.exec(`${orgId}/${name}`);
  if (!match) return new Response("Not found", { status: 404 });
  const ctx = await loadCtx();
  if (!ctx) return new Response("Unauthorized", { status: 401 });
  if (ctx.orgId !== match[1]) return new Response("Not found", { status: 404 });

  try {
    const data = await readFile(path.join(path.resolve(env.UPLOAD_DIR, "images", ctx.orgId), match[2] + "." + match[3]));
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": TYPES[match[3]],
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
