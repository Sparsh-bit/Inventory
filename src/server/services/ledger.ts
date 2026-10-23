import "server-only";
import type { ClientSession } from "mongoose";
import { AppError, type Ctx } from "../context";
import { LedgerEntry, Party, type LEDGER_KINDS, type Types } from "../models";

export interface LedgerPost {
  partyId: Types.ObjectId | string;
  kind: (typeof LEDGER_KINDS)[number];
  /** + they owe us more (customer) / we owe them more (supplier). */
  delta: number;
  date?: Date;
  docKind?: "sale" | "purchase" | "payment";
  docId?: Types.ObjectId | string | null;
  number?: string;
  note?: string;
  reversalOf?: Types.ObjectId | string;
}

/** The only way a party balance changes: atomic $inc plus a ledger line with the balance after it. */
export async function postLedger(ctx: Ctx, e: LedgerPost, session?: ClientSession) {
  if (!e.delta) return null;
  const party = await Party.findOneAndUpdate({ orgId: ctx.orgId, _id: e.partyId }, { $inc: { balance: e.delta } }, { session, returnDocument: "after", projection: { balance: 1 } }).lean();
  if (!party) throw new AppError("NOT_FOUND", "Customer or supplier not found");
  await LedgerEntry.create(
    [{
      orgId: ctx.orgId, partyId: e.partyId, kind: e.kind, delta: e.delta, balanceAfter: party.balance, date: e.date ?? new Date(),
      docKind: e.docKind ?? "", docId: e.docId ?? null, number: e.number ?? "", note: (e.note ?? "").slice(0, 300), userId: ctx.userId, reversalOf: e.reversalOf ?? null,
    }],
    { session },
  );
  return party.balance;
}

export interface StatementRow {
  id: string;
  date: Date;
  kind: (typeof LEDGER_KINDS)[number];
  number: string;
  docKind: string;
  docId: string | null;
  note: string;
  delta: number;
  balance: number;
  reversed: { at: Date; by: string; reason: string } | null;
}

/**
 * Statement in date order with a running balance. Balances from before the ledger existed
 * (or changed outside it) appear as one "brought forward" line, so the last row always equals
 * the party's real balance.
 */
export async function partyStatement(ctx: Ctx, partyId: string, limit = 500) {
  const party = await Party.findOne({ orgId: ctx.orgId, _id: partyId }, { balance: 1 }).lean();
  if (!party) throw new AppError("NOT_FOUND", "Not found");
  const entries = await LedgerEntry.find({ orgId: ctx.orgId, partyId }).sort({ date: -1, createdAt: -1 }).limit(limit).lean();
  entries.reverse();
  const sum = entries.reduce((a, x) => a + x.delta, 0);
  let running = party.balance - sum;
  const broughtForward = running;
  const rows: StatementRow[] = entries.map((x) => {
    running += x.delta;
    return {
      id: String(x._id), date: x.date, kind: x.kind, number: x.number, docKind: x.docKind, docId: x.docId ? String(x.docId) : null, note: x.note, delta: x.delta, balance: running,
      reversed: x.reversedAt ? { at: x.reversedAt, by: x.reversedBy ?? "", reason: x.reverseReason ?? "" } : null,
    };
  });
  return { broughtForward, rows, balance: party.balance };
}
