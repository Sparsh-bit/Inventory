"use server";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { AI_MAX_ROWS, AI_TYPES, type AiRow } from "@/lib/ai-menu";
import { allowed, loadCtx } from "../context";
import { connectDb } from "../db";
import { RateLimit } from "../models";
import { chatReply } from "../services/ai-chat";
import { readMenu } from "../services/ai-menu";
import { applyImport } from "../services/imports";
import { toSafeError, withAuth, type ActionResult } from "../with-auth";

/** Step 1: a photo or PDF of a menu / price list -> draft rows to review. Nothing is saved yet. */
export async function readMenuFile(form: FormData): Promise<ActionResult<{ rows: AiRow[]; note: string }>> {
  try {
    const ctx = await loadCtx();
    if (!ctx) return { ok: false, code: "UNAUTHENTICATED", error: "Your session has expired. Please sign in again." };
    if (!allowed(ctx, "products:write")) return { ok: false, code: "FORBIDDEN", error: "You don't have permission to do that." };
    const file = form.get("file");
    if (!(file instanceof File)) return { ok: false, code: "INVALID", error: "Choose a photo or PDF first." };
    if (!(AI_TYPES as readonly string[]).includes(file.type)) return { ok: false, code: "INVALID", error: "Use a photo (JPG, PNG, WebP) or a PDF." };
    await connectDb();
    const rate = await RateLimit.findOneAndUpdate(
      { key: `ai-menu:${ctx.orgId}` },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(Date.now() + 3600_000) } },
      { upsert: true, returnDocument: "after" },
    );
    if ((rate?.count ?? 0) > 20) return { ok: false, error: "Too many photos read in the last hour. Try again later." };
    return { ok: true, data: await readMenu(Buffer.from(await file.arrayBuffer()), file.type) };
  } catch (e) {
    unstable_rethrow(e);
    return { ok: false, ...toSafeError(e) };
  }
}

const row = z.object({
  name: z.string().trim().min(1).max(200),
  variant: z.string().trim().max(120).default(""),
  category: z.string().trim().max(80).default(""),
  unit: z.string().trim().max(10).default("pcs"),
  price: z.string().trim().max(14),
  cost: z.string().trim().max(14).default(""),
  tax_rate: z.string().trim().max(6).default(""),
}).strict();

/** Step 2: the reviewed rows become products (same checks as the Excel import). A missing cost price is fine. */
export const addMenuProducts = withAuth("products:write", z.object({ rows: z.array(row).min(1).max(AI_MAX_ROWS) }).strict(), async (ctx, { rows }) => {
  const res = await applyImport(ctx, "products", rows);
  revalidatePath("/products");
  return res;
});

const chat = z.object({ messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(2000) }).strict()).min(1).max(16) }).strict();

/** Ask Galla: a read-only assistant over the shop's own data. Everyone signed in can use it; each tool checks the role. */
export const askGalla = withAuth("products:read", chat, async (ctx, { messages }) => {
  if (messages[messages.length - 1].role !== "user") throw new Error("Ask a question first.");
  const rate = await RateLimit.findOneAndUpdate(
    { key: `ai-chat:${ctx.orgId}:${ctx.userId}` },
    { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(Date.now() + 3600_000) } },
    { upsert: true, returnDocument: "after" },
  );
  if ((rate?.count ?? 0) > 60) return { reply: "You have asked a lot of questions this hour. Please try again a little later." };
  return { reply: await chatReply(ctx, messages) };
});
