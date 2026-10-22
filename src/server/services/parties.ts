import "server-only";
import { z } from "zod";
import { partyInput } from "@/lib/schemas";
import { AppError, type Ctx } from "../context";
import { Party, Payment, PurchaseOrder, Sale } from "../models";
import { inTransaction } from "../with-auth";
import { audit } from "./system";

type Input = z.output<typeof partyInput>;

export async function saveParty(ctx: Ctx, id: string | null, input: Input) {
  if (id) {
    const existing = await Party.findOne({ orgId: ctx.orgId, _id: id, kind: input.kind });
    if (!existing) throw new AppError("NOT_FOUND", "Not found");
    const delta = input.openingBalance - existing.openingBalance;
    existing.set({ ...input, balance: existing.balance + delta });
    await existing.save();
    await audit(ctx, "update", input.kind, id, `Updated ${input.kind} ${input.name}`);
    return { id };
  }
  const p = await Party.create({ orgId: ctx.orgId, ...input, balance: input.openingBalance });
  await audit(ctx, "create", input.kind, String(p._id), `Created ${input.kind} ${input.name}`);
  return { id: String(p._id), name: p.name, phone: p.phone, stateCode: p.stateCode };
}

export async function setPartyActive(ctx: Ctx, id: string, active: boolean) {
  const r = await Party.updateOne({ orgId: ctx.orgId, _id: id }, { $set: { active } });
  if (!r.matchedCount) throw new AppError("NOT_FOUND", "Not found");
  await audit(ctx, active ? "restore" : "archive", "party", id, active ? "Restored contact" : "Archived contact");
}

/**
 * Customer pays us (direction in) or we pay a supplier (out). The amount is applied to the
 * oldest open documents first.
 */
export async function recordPayment(ctx: Ctx, input: { partyId: string; amount: number; method: "cash" | "card" | "upi" | "bank" | "other"; reference: string }) {
  return inTransaction(async (session) => {
    const party = await Party.findOne({ orgId: ctx.orgId, _id: input.partyId }, null, { session });
    if (!party) throw new AppError("NOT_FOUND", "Not found");
    const direction = party.kind === "customer" ? "in" : "out";
    let left = input.amount;
    const allocations: { docKind: string; docId: unknown; number: string; amount: number }[] = [];
    if (party.kind === "customer") {
      const open = await Sale.find({ orgId: ctx.orgId, customerId: party._id, status: "completed", balanceDue: { $gt: 0 } }, null, { session }).sort({ completedAt: 1 });
      for (const s of open) {
        if (left <= 0) break;
        const take = Math.min(left, s.balanceDue);
        s.balanceDue -= take;
        s.amountPaid += take;
        await s.save({ session });
        allocations.push({ docKind: "sale", docId: s._id, number: s.number ?? "", amount: take });
        left -= take;
      }
    } else {
      const open = await PurchaseOrder.find({ orgId: ctx.orgId, supplierId: party._id, status: { $in: ["partial", "received"] } }, null, { session }).sort({ createdAt: 1 });
      for (const po of open) {
        const due = po.receivedValue - po.returnedValue - po.amountPaid;
        if (left <= 0 || due <= 0) continue;
        const take = Math.min(left, due);
        po.amountPaid += take;
        await po.save({ session });
        allocations.push({ docKind: "purchase", docId: po._id, number: po.number, amount: take });
        left -= take;
      }
    }
    party.balance -= input.amount;
    await party.save({ session });
    const [pay] = await Payment.create([{ orgId: ctx.orgId, partyId: party._id, direction, amount: input.amount, method: input.method, allocations, reference: input.reference, userId: ctx.userId }], { session });
    await audit(ctx, "payment", party.kind, String(party._id), `${direction === "in" ? "Received" : "Paid"} payment`, { amount: input.amount }, session);
    return { id: String(pay._id) };
  });
}
