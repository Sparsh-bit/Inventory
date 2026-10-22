import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { fromMinor } from "@/lib/money";
import { formatQty } from "@/lib/format";
import { requireCtx } from "@/server/context";
import { Product, PurchaseOrder } from "@/server/models";
import { PageBody, PageHeader } from "@/components/app/page-header";
import { PoForm } from "@/components/purchases/po-form";
import { poFormData } from "../../form-data";

export const metadata: Metadata = { title: "Edit purchase order" };

export default async function EditPurchasePage({ params }: PageProps<"/purchases/[id]/edit">) {
  const ctx = await requireCtx("purchases:write");
  const { id } = await params;
  if (!/^[a-f0-9]{24}$/.test(id)) notFound();
  const po = await PurchaseOrder.findOne({ orgId: ctx.orgId, _id: id }).lean();
  if (!po) notFound();
  if (!["draft", "ordered"].includes(po.status)) redirect(`/purchases/${id}`);
  const products = await Product.find({ orgId: ctx.orgId, _id: { $in: po.lines.map((l) => l.productId) } }, { unit: 1 }).lean();
  const unit = (pid: unknown) => products.find((p) => String(p._id) === String(pid))?.unit?.code ?? "pcs";
  return (
    <PageBody>
      <PageHeader title={`Edit ${po.number}`} back={{ href: `/purchases/${id}`, label: po.number }} />
      <PoForm
        {...await poFormData(ctx)}
        initial={{
          id, supplierId: String(po.supplierId), locationId: String(po.locationId), expectedDate: po.expectedDate ? po.expectedDate.toISOString().slice(0, 10) : null,
          supplierInvoiceNo: po.supplierInvoiceNo, notes: po.notes,
          lines: po.lines.map((l) => ({ variantId: String(l.variantId), name: l.name ?? "", sku: l.sku ?? "", unit: unit(l.productId), scale: l.scale ?? 1, qty: formatQty(l.qtyOrdered, l.scale ?? 1), cost: fromMinor(l.unitCost) })),
        }}
      />
    </PageBody>
  );
}
