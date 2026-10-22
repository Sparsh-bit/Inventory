import type { Metadata } from "next";
import { PartyDetailPage } from "@/components/parties/party-pages";

export const metadata: Metadata = { title: "Supplier" };

export default async function SupplierPage({ params }: PageProps<"/suppliers/[id]">) {
  return <PartyDetailPage kind="supplier" id={(await params).id} />;
}
