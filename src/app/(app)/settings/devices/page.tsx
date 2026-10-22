import type { Metadata } from "next";
import { requireCtx } from "@/server/context";
import { PageBody, PageHeader } from "@/components/app/page-header";
import { DeviceSettings } from "@/components/settings/device-settings";

export const metadata: Metadata = { title: "Printer & scanner" };

export default async function DevicesPage() {
  await requireCtx();
  return (
    <PageBody className="max-w-3xl">
      <PageHeader title="Printer & scanner" description="These settings are saved on this device only, so every counter can use its own printer." back={{ href: "/settings", label: "Settings" }} />
      <DeviceSettings />
    </PageBody>
  );
}
