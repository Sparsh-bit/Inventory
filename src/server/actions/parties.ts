"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { can } from "@/lib/permissions";
import { objectId, partyInput } from "@/lib/schemas";
import { AppError, type Ctx } from "../context";
import { LedgerEntry, Party } from "../models";
import { addUdhaar, listOpenDocs, recordPayment, reverseEntry, saveParty, setPartyActive } from "../services/parties";
import { withAuth } from "../with-auth";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date");

// Customers are managed by sales staff; suppliers by purchasing staff.
const canKind = (ctx: Ctx, kind: string) => (kind === "supplier" ? can(ctx.role, "purchases:write") : can(ctx.role, "parties:write"));

export const upsertParty = withAuth("parties:read", z.object({ id: objectId.nullable(), data: partyInput }).strict(), async (ctx, { id, data }) => {
  if (!canKind(ctx, data.kind)) throw new AppError("FORBIDDEN", "You don't have permission to do that.");
  const r = await saveParty(ctx, id, data);
  revalidatePath(data.kind === "customer" ? "/customers" : "/suppliers");
  return { id: r.id };
});

export const archiveParty = withAuth("parties:read", z.object({ id: objectId, active: z.boolean() }).strict(), async (ctx, { id, active }) => {
  const p = await Party.findOne({ orgId: ctx.orgId, _id: id }, { kind: 1 }).lean();
  if (!p) throw new AppError("NOT_FOUND", "Not found");
  if (!canKind(ctx, p.kind)) throw new AppError("FORBIDDEN", "You don't have permission to do that.");
  await setPartyActive(ctx, id, active);
  return null;
});

export const addPayment = withAuth(
  "parties:read",
  z
    .object({
      partyId: objectId,
      amount: z.number().int().min(1).max(1e13),
      method: z.enum(["cash", "card", "upi", "bank", "other"]),
      reference: z.string().trim().max(100),
      note: z.string().trim().max(300).default(""),
      date: day.nullable().default(null),
      allocations: z.array(z.object({ docId: objectId, amount: z.number().int().min(1).max(1e13) }).strict()).max(200).default([]),
    })
    .strict(),
  async (ctx, input) => {
    const p = await Party.findOne({ orgId: ctx.orgId, _id: input.partyId }, { kind: 1 }).lean();
    if (!p) throw new AppError("NOT_FOUND", "Not found");
    if (!canKind(ctx, p.kind)) throw new AppError("FORBIDDEN", "You don't have permission to do that.");
    const r = await recordPayment(ctx, input);
    revalidatePath(`/${p.kind === "customer" ? "customers" : "suppliers"}/${input.partyId}`);
    return r;
  },
);

async function partyKind(ctx: Ctx, partyId: string) {
  const p = await Party.findOne({ orgId: ctx.orgId, _id: partyId }, { kind: 1 }).lean();
  if (!p) throw new AppError("NOT_FOUND", "Not found");
  if (!canKind(ctx, p.kind)) throw new AppError("FORBIDDEN", "You don't have permission to do that.");
  return p.kind;
}

/** Unpaid bills a payment can be set against. */
export const openBills = withAuth("parties:read", z.object({ partyId: objectId }).strict(), async (ctx, { partyId }) => {
  await partyKind(ctx, partyId);
  return listOpenDocs(ctx, partyId);
});

/** Khata: udhaar given to a customer / taken from a supplier, without a bill. */
export const addUdhaarEntry = withAuth(
  "parties:read",
  z.object({ partyId: objectId, amount: z.number().int().min(1).max(1e13), note: z.string().trim().min(1, "Add a short note, e.g. what it was for").max(300), date: day.nullable().default(null) }).strict(),
  async (ctx, input) => {
    const kind = await partyKind(ctx, input.partyId);
    const r = await addUdhaar(ctx, input);
    revalidatePath(`/${kind === "customer" ? "customers" : "suppliers"}/${input.partyId}`);
    revalidatePath("/khata");
    return r;
  },
);

/** Undo a mistaken udhaar entry or payment. Owners and managers only; a reason is required. */
export const undoEntry = withAuth(
  "ledger:reverse",
  z.object({ entryId: objectId, reason: z.string().trim().min(3, "Say why this is being undone").max(200) }).strict(),
  async (ctx, input) => {
    const e = await LedgerEntry.findOne({ orgId: ctx.orgId, _id: input.entryId }, { partyId: 1 }).lean();
    if (!e) throw new AppError("NOT_FOUND", "Entry not found");
    const kind = await partyKind(ctx, String(e.partyId));
    const r = await reverseEntry(ctx, input);
    revalidatePath(`/${kind === "customer" ? "customers" : "suppliers"}/${e.partyId}`);
    revalidatePath("/khata");
    return r;
  },
);
