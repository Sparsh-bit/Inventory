import type { Metadata } from "next";
import { PartyListPage } from "@/components/parties/party-pages";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: PageProps<"/customers">) {
  return <PartyListPage kind="customer" searchParams={await searchParams} />;
}
