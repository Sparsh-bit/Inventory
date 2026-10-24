import { readFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/env";
import { can } from "@/lib/permissions";
import { loadCtx } from "@/server/context";

const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp", pdf: "application/pdf" };

/** Supplier bills and receipts. Each business's files live in their own folder, so another business gets 404. */
export async function GET(_req: Request, { params }: RouteContext<"/api/docs/[name]">) {
  const { name } = await params;
  const m = /^([a-f0-9]{32})\.(png|jpg|webp|pdf)$/.exec(name); // strict pattern = no path traversal
  if (!m) return new Response("Not found", { status: 404 });
  const ctx = await loadCtx();
  if (!ctx) return new Response("Unauthorized", { status: 401 });
  if (!can(ctx.role, "purchases:read")) return new Response("Forbidden", { status: 403 });
  try {
    const data = await readFile(path.join(path.resolve(env.UPLOAD_DIR, "docs", ctx.orgId), name));
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": TYPES[m[2]],
        "Content-Disposition": `inline; filename="${name}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        ...(m[2] === "pdf" ? {} : { "Content-Security-Policy": "default-src 'none'" }),
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
