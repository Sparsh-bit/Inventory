import type { Metadata } from "next";
import Link from "next/link";
import { Building2, ChevronRight, ClipboardList, MapPin, Percent, Printer, ReceiptText, UserRound, Users } from "lucide-react";
import { can, type Permission } from "@/lib/permissions";
import { requireCtx } from "@/server/context";
import { PageBody, PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Settings" };

const ITEMS: { href: string; title: string; text: string; icon: typeof Building2; permission?: Permission }[] = [
  { href: "/settings/business", title: "Business profile", text: "Name, address, GSTIN, currency, tax mode and logo.", icon: Building2, permission: "settings:manage" },
  { href: "/settings/taxes", title: "Tax rates", text: "GST/VAT slabs and cess used on products.", icon: Percent, permission: "settings:manage" },
  { href: "/settings/locations", title: "Locations", text: "Shops and warehouses that hold stock.", icon: MapPin, permission: "settings:manage" },
  { href: "/settings/receipt", title: "Receipts & numbering", text: "Paper width, header/footer, UPI QR, bill prefixes, scanner speed.", icon: ReceiptText, permission: "settings:manage" },
  { href: "/settings/devices", title: "Printer & scanner (this device)", text: "Connect a thermal printer by USB, Bluetooth, serial or network.", icon: Printer },
  { href: "/settings/members", title: "Team & roles", text: "Invite staff and choose what each person can do.", icon: Users, permission: "members:manage" },
  { href: "/settings/audit", title: "Audit log", text: "Who changed what, and when.", icon: ClipboardList, permission: "audit:read" },
  { href: "/account", title: "My account", text: "Your name, password, two-factor login and sessions.", icon: UserRound },
];

export default async function SettingsPage() {
  const ctx = await requireCtx();
  const items = ITEMS.filter((i) => !i.permission || can(ctx.role, i.permission));
  return (
    <PageBody className="max-w-4xl">
      <PageHeader title="Settings" description={`Manage ${ctx.orgName}.`} />
      <Card className="divide-y py-0">
        {items.map(({ href, title, text, icon: Icon }) => (
          <Link key={href} href={href} className="flex items-center gap-4 p-4 transition hover:bg-muted/50">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="size-5" /></span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{title}</span>
              <span className="block text-sm text-muted-foreground">{text}</span>
            </span>
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
        ))}
      </Card>
    </PageBody>
  );
}
