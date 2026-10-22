"use client";
import { createContext, useContext } from "react";
import { formatMoney } from "@/lib/money";
import type { Permission, Role } from "@/lib/permissions";
import { can } from "@/lib/permissions";

export interface OrgInfo {
  orgId: string;
  orgName: string;
  role: Role;
  userId: string;
  userName: string;
  currency: string;
  locale: string;
  timezone: string;
  taxMode: "GST" | "VAT" | "NONE";
  scanner: { interKeyMs: number; minLength: number };
  receiptWidth: 58 | 80;
}

const OrgContext = createContext<OrgInfo | null>(null);

export function OrgProvider({ value, children }: { value: OrgInfo; children: React.ReactNode }) {
  return <OrgContext value={value}>{children}</OrgContext>;
}

export function useOrg() {
  const v = useContext(OrgContext);
  if (!v) throw new Error("useOrg must be used inside OrgProvider");
  return {
    ...v,
    money: (minor: number) => formatMoney(minor, v.currency, v.locale),
    can: (p: Permission) => can(v.role, p),
  };
}
