"use client";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore } from "lucide-react";
import { archiveProduct } from "@/server/actions/products";
import { useAction } from "@/components/app/use-action";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export function ArchiveButton({ id, active }: { id: string; active: boolean }) {
  const router = useRouter();
  const { run, pending } = useAction(archiveProduct);
  const act = () => run({ id, active: !active }, { success: active ? "Product archived" : "Product restored", onSuccess: () => router.refresh() });
  if (!active)
    return (
      <Button variant="outline" onClick={act} disabled={pending}>
        <ArchiveRestore /> Restore
      </Button>
    );
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline">
          <Archive /> Archive
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive this product?</AlertDialogTitle>
          <AlertDialogDescription>It will be hidden from the POS and product search. Its sales history and stock are kept, and you can restore it anytime.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={act}>Archive</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
