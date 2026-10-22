"use server";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import type { ImportKind, RowError } from "@/lib/import";
import { can, type Permission } from "@/lib/permissions";
import { loadCtx } from "../context";
import { connectDb } from "../db";
import { applyImport, readSheet, validate } from "../services/imports";
import { toSafeError, type ActionResult } from "../with-auth";

const PERM: Record<ImportKind, Permission[]> = { products: ["import:run", "products:write"], customers: ["import:run", "parties:write"], suppliers: ["import:run", "purchases:write"] };

async function guard(form: FormData) {
  const ctx = await loadCtx();
  if (!ctx) throw new Error("Your session has expired. Please sign in again.");
  const kind = String(form.get("kind")) as ImportKind;
  if (!(kind in PERM)) throw new Error("Unknown import type");
  if (!PERM[kind].every((p) => can(ctx.role, p))) throw new Error("You don't have permission to do that.");
  const file = form.get("file");
  if (!(file instanceof File)) throw new Error("Choose a file to import");
  await connectDb();
  return { ctx, kind, rows: await readSheet(file) };
}

export async function previewImport(form: FormData): Promise<ActionResult<{ total: number; valid: number; errors: RowError[]; headers: string[]; sample: Record<string, string>[] }>> {
  try {
    const { kind, rows } = await guard(form);
    const v = validate(kind, rows);
    return { ok: true, data: { total: rows.length, valid: v.valid.length, errors: v.errors.slice(0, 100), headers: Object.keys(rows[0] ?? {}), sample: rows.slice(0, 8) } };
  } catch (e) {
    unstable_rethrow(e);
    return { ok: false, error: e instanceof Error && !("code" in e) ? e.message : toSafeError(e).error };
  }
}

export async function runImport(form: FormData): Promise<ActionResult<{ created: number; updated: number; failed: RowError[]; failedCount: number }>> {
  try {
    const { ctx, kind, rows } = await guard(form);
    const r = await applyImport(ctx, kind, rows);
    revalidatePath(kind === "products" ? "/products" : `/${kind}`);
    return { ok: true, data: r };
  } catch (e) {
    unstable_rethrow(e);
    return { ok: false, error: e instanceof Error && !("code" in e) ? e.message : toSafeError(e).error };
  }
}
