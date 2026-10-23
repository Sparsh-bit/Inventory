import "server-only";
import { z } from "zod";
import { dayIn, zonedNoon } from "@/lib/dates";
import { partyInput } from "@/lib/schemas";
import type { ClientSession } from "mongoose";
import { AppError, getOrgSettings, type Ctx } from "../context";
import { LedgerEntry, Party, Payment, PurchaseOrder, Sale, Types } from "../models";
import { inTransaction } from "../with-auth";
import { postLedger } from "./ledger";
import { audit } from "./system";

type Input = z.output<typeof partyInput>;

export async function saveParty(ctx: Ctx, id: string | null, input: Input) {
  if (id) {
    return inTransaction(async (session) => {
      const existing = await Party.findOne({ orgId: ctx.orgId, _id: id, kind: input.kind }, null, { session }).lean();
      if (!existing) throw new AppError("NOT_FOUND", "Not found");
      const delta = input.openingBalance - existing.openingBalance;
      // Balance only moves through the ledger; the openingBalance guard stops two saves posting the same change.
      const r = await Party.updateOne({ orgId: ctx.orgId, _id: id, openingBalance: existing.openingBalance }, { $set: input }, { session, runValidators: true });
      if (!r.matchedCount) throw new AppError("CONFLICT", "This contact was changed at the same time. Refresh and try again.");
      if (delta) await postLedger(ctx, { partyId: existing._id, kind: "opening", delta, note: "Opening balance changed" }, session);
      await audit(ctx, "update", input.kind, id, `Updated ${input.kind} ${input.name}`, undefined, session);
      return { id };
    });
  }
  return inTransaction(async (session) => {
    const [p] = await Party.create([{ orgId: ctx.orgId, ...input, balance: 0 }], { session });
    if (input.openingBalance) await postLedger(ctx, { partyId: p._id, kind: "opening", delta: input.openingBalance, note: "Opening balance" }, session);
    await audit(ctx, "create", input.kind, String(p._id), `Created ${input.kind} ${input.name}`, undefined, session);
    return { id: String(p._id), name: p.name, phone: p.phone, stateCode: p.stateCode };
  });
}

export async function setPartyActive(ctx: Ctx, id: string, active: boolean) {
  const r = await Party.updateOne({ orgId: ctx.orgId, _id: id }, { $set: { active } });
  if (!r.matchedCount) throw new AppError("NOT_FOUND", "Not found");
  await audit(ctx, active ? "restore" : "archive", "party", id, active ? "Restored contact" : "Archived contact");
}

/** "YYYY-MM-DD" from a form → a Date. Today means now; past days are back-dated to midday in the business's time zone; no future dates. */
export async function entryDate(ctx: Ctx, day?: string | null) {
  if (!day) return new Date();
  const { timezone } = await getOrgSettings(ctx.orgId);
  const today = dayIn(timezone);
  if (day === today) return new Date();
  if (day > today) throw new AppError("INVALID", "The date can't be in the future.");
  if (day < "2000-01-01") throw new AppError("INVALID", "Enter a valid date.");
  return zonedNoon(day, timezone);
}

/** Unpaid bills (customer) or received purchases with money still owed (supplier), oldest first. */
async function openDocs(ctx: Ctx, party: { _id: Types.ObjectId; kind: string }, session?: ClientSession) {
  if (party.kind === "customer") {
    const sales = await Sale.find({ orgId: ctx.orgId, customerId: party._id, status: "completed", balanceDue: { $gt: 0 } }, null, { session }).sort({ completedAt: 1 });
    return sales.map((d) => ({
      id: String(d._id), kind: "sale" as const, number: d.number ?? "", ref: "", date: d.completedAt ?? d.createdAt, total: d.grandTotal ?? 0, due: d.balanceDue ?? 0,
      pay: (amt: number) => { d.balanceDue = (d.balanceDue ?? 0) - amt; d.amountPaid = (d.amountPaid ?? 0) + amt; return d.save({ session }); },
    }));
  }
  const pos = await PurchaseOrder.find({ orgId: ctx.orgId, supplierId: party._id, status: { $in: ["partial", "received"] } }, null, { session }).sort({ createdAt: 1 });
  return pos
    .map((d) => ({
      id: String(d._id), kind: "purchase" as const, number: d.number, ref: d.supplierInvoiceNo ?? "", date: d.createdAt as Date, total: d.receivedValue - d.returnedValue, due: d.receivedValue - d.returnedValue - d.amountPaid,
      pay: (amt: number) => { d.amountPaid += amt; return d.save({ session }); },
    }))
    .filter((d) => d.due > 0);
}

export async function listOpenDocs(ctx: Ctx, partyId: string) {
  const party = await Party.findOne({ orgId: ctx.orgId, _id: partyId }, { kind: 1 }).lean();
  if (!party) throw new AppError("NOT_FOUND", "Not found");
  return (await openDocs(ctx, party)).map(({ id, kind, number, ref, date, total, due }) => ({ id, kind, number, ref, date: date.toISOString(), total, due }));
}

export interface PaymentInput {
  partyId: string;
  amount: number;
  method: "cash" | "card" | "upi" | "bank" | "other";
  reference: string;
  note?: string;
  date?: string | null;
  /** Bills this payment settles and how much of each. Anything left goes to the oldest other bills. */
  allocations?: { docId: string; amount: number }[];
}

/** Customer pays us (direction in) or we pay a supplier (out). */
export async function recordPayment(ctx: Ctx, input: PaymentInput) {
  const date = await entryDate(ctx, input.date);
  return inTransaction(async (session) => {
    const party = await Party.findOne({ orgId: ctx.orgId, _id: input.partyId }, null, { session });
    if (!party) throw new AppError("NOT_FOUND", "Not found");
    const direction = party.kind === "customer" ? "in" : "out";
    const docs = await openDocs(ctx, party, session);
    const byId = new Map(docs.map((d) => [d.id, d]));
    const plan = new Map<string, number>();
    for (const a of input.allocations ?? []) {
      const d = byId.get(a.docId);
      if (!d) throw new AppError("INVALID", "That bill is already paid or doesn't belong to this account. Refresh and try again.");
      if (plan.has(a.docId)) throw new AppError("INVALID", `${d.number} is listed twice.`);
      if (a.amount > d.due) throw new AppError("INVALID", `${d.number} only has ${(d.due / 100).toFixed(2)} due.`);
      plan.set(a.docId, a.amount);
    }
    const chosen = [...plan.values()].reduce((x, y) => x + y, 0);
    if (chosen > input.amount) throw new AppError("INVALID", "The amounts against bills add up to more than the payment.");
    let left = input.amount - chosen;
    for (const d of docs) {
      if (left <= 0) break;
      if (plan.has(d.id)) continue;
      const take = Math.min(left, d.due);
      plan.set(d.id, take);
      left -= take;
    }
    const allocations: { docKind: string; docId: unknown; number: string; amount: number }[] = [];
    for (const d of docs) {
      const amt = plan.get(d.id);
      if (!amt) continue;
      await d.pay(amt);
      allocations.push({ docKind: d.kind, docId: new Types.ObjectId(d.id), number: d.number, amount: amt });
    }
    const [pay] = await Payment.create(
      [{ orgId: ctx.orgId, partyId: party._id, direction, amount: input.amount, method: input.method, allocations, reference: input.reference, note: input.note ?? "", date, userId: ctx.userId }],
      { session },
    );
    const against = allocations.map((a) => a.number).join(", ");
    await postLedger(ctx, { partyId: party._id, kind: "payment", delta: -input.amount, date, docKind: "payment", docId: pay._id, number: against, note: [METHOD_LABEL[input.method], input.reference, input.note].filter(Boolean).join(" · ") + (left > 0 ? " · advance" : "") }, session);
    await audit(ctx, "payment", party.kind, String(party._id), `${direction === "in" ? "Received" : "Paid"} payment`, { amount: input.amount, allocations: allocations.map((a) => ({ number: a.number, amount: a.amount })) }, session);
    return { id: String(pay._id), allocations: allocations.map((a) => ({ number: a.number, amount: a.amount })), advance: left };
  });
}

const METHOD_LABEL = { cash: "Cash", card: "Card", upi: "UPI", bank: "Bank transfer", other: "Other" } as const;

/**
 * Udhaar / khata entry without a bill: for a customer "gave udhaar" (they owe us more),
 * for a supplier "took udhaar" (we owe them more). Money coming back is a payment.
 */
export async function addUdhaar(ctx: Ctx, input: { partyId: string; amount: number; note: string; date?: string | null }) {
  const date = await entryDate(ctx, input.date);
  return inTransaction(async (session) => {
    const party = await Party.findOne({ orgId: ctx.orgId, _id: input.partyId }, null, { session }).lean();
    if (!party) throw new AppError("NOT_FOUND", "Not found");
    if (party.kind === "customer" && party.creditLimit > 0 && party.balance + input.amount > party.creditLimit) {
      throw new AppError("CREDIT_LIMIT", `This takes ${party.name} over the credit limit. Raise the limit on the customer first.`);
    }
    const balance = await postLedger(ctx, { partyId: party._id, kind: "udhaar", delta: input.amount, date, note: input.note }, session);
    await audit(ctx, "udhaar", party.kind, String(party._id), party.kind === "customer" ? "Gave udhaar" : "Took udhaar", { amount: input.amount, note: input.note }, session);
    return { balance };
  });
}

/**
 * Undo a mistaken udhaar entry or payment (owner/manager). Nothing is deleted: the original line
 * is marked reversed and an equal and opposite line is posted. Undoing a payment puts the amounts
 * back as due on the bills it had paid.
 */
export async function reverseEntry(ctx: Ctx, input: { entryId: string; reason: string }) {
  return inTransaction(async (session) => {
    const e = await LedgerEntry.findOne({ orgId: ctx.orgId, _id: input.entryId }, null, { session }).lean();
    if (!e) throw new AppError("NOT_FOUND", "Entry not found");
    if (e.kind !== "udhaar" && e.kind !== "payment") throw new AppError("INVALID", "Only udhaar entries and payments can be undone. Correct a bill with a return, or a purchase with a supplier return.");
    const mark = await LedgerEntry.updateOne(
      { orgId: ctx.orgId, _id: e._id, reversedAt: null },
      { $set: { reversedAt: new Date(), reversedBy: ctx.userName || ctx.userEmail, reverseReason: input.reason } },
      { session },
    );
    if (!mark.matchedCount) throw new AppError("CONFLICT", "This entry has already been undone.");

    if (e.kind === "payment") {
      const pay = await Payment.findOne({ orgId: ctx.orgId, _id: e.docId }, null, { session });
      if (!pay) throw new AppError("NOT_FOUND", "Payment not found");
      for (const a of pay.allocations) {
        if (a.docKind === "sale") {
          const u = await Sale.updateOne({ orgId: ctx.orgId, _id: a.docId, status: "completed" }, { $inc: { balanceDue: a.amount ?? 0, amountPaid: -(a.amount ?? 0) } }, { session });
          if (!u.matchedCount) throw new AppError("CONFLICT", `Bill ${a.number} was voided, so this payment can't be undone. Record any refund as a separate entry.`);
        } else {
          await PurchaseOrder.updateOne({ orgId: ctx.orgId, _id: a.docId }, { $inc: { amountPaid: -(a.amount ?? 0) } }, { session });
        }
      }
      pay.reversedAt = new Date();
      await pay.save({ session });
    }

    const what = e.kind === "payment" ? "payment" : "udhaar";
    const balance = await postLedger(
      ctx,
      { partyId: e.partyId, kind: "reversal", delta: -e.delta, docKind: (e.docKind || undefined) as "payment" | undefined, docId: e.docId, number: e.number, note: `Undo ${what}: ${input.reason}`, reversalOf: e._id },
      session,
    );
    await audit(ctx, "reverse", "ledger", String(e._id), `Undid ${what} of ${(Math.abs(e.delta) / 100).toFixed(2)}`, { reason: input.reason }, session);
    return { balance };
  });
}
