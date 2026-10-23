"use client";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { attachFiles, detachFile } from "@/server/actions/purchases";
import { useAction } from "@/components/app/use-action";
import { AttachmentsField, type Attachment } from "./attachments";

/** Attach or remove bill photos/PDFs on an existing purchase; saved straight away. */
export function PoAttachments({ id, files, canWrite }: { id: string; files: Attachment[]; canWrite: boolean }) {
  const router = useRouter();
  const add = useAction(attachFiles);
  const remove = useAction(detachFile);
  if (!canWrite) {
    return files.length ? (
      <ul className="space-y-1 text-sm">
        {files.map((f) => (
          <li key={f.url}><a className="underline" href={f.url} target="_blank" rel="noopener noreferrer">{f.name}</a></li>
        ))}
      </ul>
    ) : (
      <p className="text-sm text-muted-foreground">No files attached.</p>
    );
  }
  return (
    <AttachmentsField
      value={files}
      disabled={add.pending || remove.pending}
      onAdd={(f) => add.run({ id, files: f }, { onSuccess: () => { toast.success(f.length > 1 ? "Files attached" : "File attached"); router.refresh(); } })}
      onRemove={(a) => confirm(`Remove ${a.name}?`) && remove.run({ id, url: a.url }, { success: "File removed", onSuccess: () => router.refresh() })}
    />
  );
}
