"use client";
import { CloudOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/** POS toolbar indicator: offline state and bills waiting to sync. */
export function OfflineStatus({ online, pending, syncing, ready, onSync }: { online: boolean; pending: number; syncing: boolean; ready: boolean; onSync: () => void }) {
  if (online && pending === 0) return null;
  if (!online)
    return (
      <span role="status" className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-warning/20 px-2.5 text-sm font-medium text-warning-foreground dark:text-warning" title={ready ? "Bills are saved on this device and sync automatically." : "Open the POS once while online to enable offline billing."}>
        <CloudOff className="size-4" /> Offline{pending > 0 && ` · ${pending} to sync`}
      </span>
    );
  return (
    <Button variant="secondary" onClick={onSync} disabled={syncing} aria-label={`Sync ${pending} offline bills`}>
      {syncing ? <Spinner /> : <RefreshCw />} {pending} to sync
    </Button>
  );
}
