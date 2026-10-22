import { cookies, headers } from "next/headers";
import Link from "next/link";
import { ScanBarcode } from "lucide-react";
import { can } from "@/lib/permissions";
import { auth } from "@/server/auth";
import { getOrgSettings, requireCtx } from "@/server/context";
import { AppSidebar } from "@/components/app/app-sidebar";
import { CommandMenu } from "@/components/app/command-menu";
import { OrgProvider } from "@/components/app/org-context";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const ctx = await requireCtx();
  const [settings, orgs, cookieStore] = await Promise.all([
    getOrgSettings(ctx.orgId),
    auth.api.listOrganizations({ headers: await headers() }),
    cookies(),
  ]);

  return (
    <OrgProvider
      value={{
        orgId: ctx.orgId, orgName: ctx.orgName, role: ctx.role, userId: ctx.userId, userName: ctx.userName,
        currency: settings.currency, locale: settings.locale, timezone: settings.timezone, taxMode: settings.taxMode as "GST" | "VAT" | "NONE",
        scanner: { interKeyMs: settings.scanner?.interKeyMs ?? 35, minLength: settings.scanner?.minLength ?? 4 },
        receiptWidth: (settings.receipt?.paperWidth ?? 80) as 58 | 80,
      }}
    >
      <SidebarProvider defaultOpen={cookieStore.get("sidebar_state")?.value !== "false"}>
        <AppSidebar orgs={orgs.map((o) => ({ id: o.id, name: o.name }))} userEmail={ctx.userEmail} />
        <SidebarInset className="min-w-0">
          <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-5" />
            <CommandMenu />
            <div className="ml-auto flex items-center gap-2">
              {can(ctx.role, "pos:sell") && (
                <Button asChild size="sm">
                  <Link href="/pos">
                    <ScanBarcode /> <span className="hidden sm:inline">New sale</span>
                  </Link>
                </Button>
              )}
            </div>
          </header>
          <div className="flex-1">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </OrgProvider>
  );
}
