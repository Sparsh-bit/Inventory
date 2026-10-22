import type { Metadata } from "next";
import { PartyDetailPage } from "@/components/parties/party-pages";

export const metadata: Metadata = { title: "Customer" };

export default async function CustomerPage({ params }: PageProps<"/customers/[id]">) {
  return <PartyDetailPage kind="customer" id={(await params).id} />;
}
