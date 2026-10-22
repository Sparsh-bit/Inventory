import type { Metadata } from "next";
import { requireCtx } from "@/server/context";
import { readScans } from "@/server/services/scan";
import { PhoneScanner } from "./phone-scanner";

export const metadata: Metadata = { title: "Phone scanner" };

export default async function PhoneScanPage({ params }: PageProps<"/scan/[token]">) {
  const ctx = await requireCtx();
  const { token } = await params;
  const valid = token.length <= 100 && !!(await readScans(ctx, token));
  return <PhoneScanner token={token} valid={valid} orgName={ctx.orgName} />;
}
