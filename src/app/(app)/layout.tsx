import { cookies } from "next/headers";
import Link from "next/link";
import { ScanBarcode } from "lucide-react";
import { getOrgSettings, requireCtx, allowed } from "@/server/context";
import { AppSidebar } from "@/components/app/app-sidebar";
import { Assistant } from "@/components/app/assistant";
import { CommandMenu } from "@/components/app/command-menu";
import { OrgProvider } from "@/components/app/org-context";
import { RegisterServiceWorker } from "@/components/offline/register-sw";
import { UpdateNotifier } from "@/components/app/update-notifier";
import { DeviceBridge } from "@/components/print/device-bridge";
import { ConnectionBanner } from "@/components/offline/connection-banner";
import { PhoneLinkButton, PhoneLinkProvider } from "@/components/scanner/phone-link";
import { LanguagePicker } from "@/components/app/i18n-provider";
import { getT } from "@/server/i18n";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const ctx = await requireCtx();
  const [settings, cookieStore, t] = await Promise.all([getOrgSettings(ctx.orgId), cookies(), getT()]);

  return (
    <OrgProvider
      value={{
        orgId: ctx.orgId, orgName: ctx.orgName, role: ctx.role, userId: ctx.userId, userName: ctx.userName,
        currency: settings.currency, locale: settings.locale, timezone: settings.timezone, taxMode: settings.taxMode as "GST" | "VAT" | "NONE",
        scanner: { interKeyMs: settings.scanner?.interKeyMs ?? 35, minLength: settings.scanner?.minLength ?? 4 },
        receiptWidth: (settings.receipt?.paperWidth ?? 80) as 58 | 80, features: ctx.features,
      }}
    >
      <RegisterServiceWorker />
      <UpdateNotifier />
      <DeviceBridge />
      <PhoneLinkProvider>
      <SidebarProvider defaultOpen={cookieStore.get("sidebar_state")?.value !== "false"}>
        <AppSidebar orgs={ctx.orgs ?? []} userEmail={ctx.userEmail} />
        <SidebarInset className="min-w-0">
          <ConnectionBanner />
          {ctx.plan === "Demo" && (
            <div role="status" className="border-b bg-amber-50 px-4 py-2 text-center text-xs text-amber-900">
              You are in the Galla demo: sample data that resets in 24 hours. <a className="font-semibold underline" href="mailto:team@concilio.solutions?subject=Galla%20for%20my%20shop">Talk to us about your real shop</a>
            </div>
          )}
          <header data-app-header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-5" />
            <CommandMenu />
            <Assistant />
            <div className="ml-auto flex items-center gap-2">
              <LanguagePicker />
              {allowed(ctx, "products:read") && <PhoneLinkButton compact />}
              {allowed(ctx, "pos:sell") && (
                <Button asChild size="sm">
                  <Link href="/pos">
                    <ScanBarcode /> <span className="hidden sm:inline">{t("New sale")}</span>
                  </Link>
                </Button>
              )}
            </div>
          </header>
          <div className="flex-1">{children}</div>
        </SidebarInset>
      </SidebarProvider>
      </PhoneLinkProvider>
    </OrgProvider>
  );
}
