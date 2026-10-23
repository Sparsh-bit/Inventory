import type { Metadata } from "next";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { upiLink } from "@/lib/receipt";
import { verifyBillToken } from "@/server/bill-link";
import type { Ctx } from "@/server/context";
import { connectDb } from "@/server/db";
import { Types } from "@/server/models";
import { getReceiptData } from "@/server/services/receipt";
import { ReceiptView } from "@/components/print/receipt-view";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Your bill", robots: { index: false, follow: false }, referrer: "no-referrer" };

/** Public bill opened from a WhatsApp link. The signed token is the only key; no login. */
export default async function PublicBillPage({ params }: PageProps<"/bill/[token]">) {
  const ids = verifyBillToken((await params).token);
  if (!ids) notFound();
  const db = (await connectDb()).connection.db!;
  const org = await db.collection("organization").findOne({ _id: new Types.ObjectId(ids.orgId) }, { projection: { name: 1 } });
  if (!org) notFound();
  const ctx = { orgId: ids.orgId, orgName: String(org.name), userId: "public", userName: "", userEmail: "", role: "cashier" } satisfies Ctx;
  const d = await getReceiptData(ctx, ids.saleId).catch(() => null);
  if (!d) notFound();
  d.org.logoUrl = null; // logos are served to signed-in users only
  const qr = d.org.showUpiQr && d.org.upiId && d.sale.kind !== "return" && d.sale.status !== "void" && d.sale.balanceDue > 0 ? await QRCode.toDataURL(upiLink(d, d.sale.balanceDue), { margin: 0, width: 160 }) : null;

  return (
    <main className="min-h-dvh bg-neutral-100 px-4 py-6 text-black print:bg-white print:p-0">
      <h1 className="sr-only">Bill {d.sale.number} from {d.org.name}</h1>
      <ReceiptView d={d} width={80} qr={qr} />
      <div className="mx-auto mt-4 flex max-w-[80mm] justify-center print:hidden">
        <PrintButton />
      </div>
    </main>
  );
}
