import { NextResponse } from "next/server";
import { loadCtx } from "@/server/context";
import { sameOrigin } from "@/server/http";
import { pushScan } from "@/server/services/scan";

/** Phone → server: one scanned code for a paired desktop session. */
export async function POST(req: Request, { params }: RouteContext<"/api/scan/[token]">) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const ctx = await loadCtx();
  if (!ctx) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  const { token } = await params;
  const body = (await req.json().catch(() => null)) as { code?: unknown } | null;
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (!/^[\x20-\x7e]{1,64}$/.test(code) || token.length > 100) return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  const ok = await pushScan(ctx, token, code);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "This pairing has expired. Scan the QR code on the computer again." }, { status: 410 });
}
