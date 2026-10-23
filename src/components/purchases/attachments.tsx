"use client";
import { useRef, useState } from "react";
import { Camera, FileText, ImageIcon, Paperclip, X } from "lucide-react";
import { toast } from "sonner";
import { MAX_ATTACHMENTS } from "@/lib/purchase";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export interface Attachment {
  url: string;
  name: string;
  type: "png" | "jpg" | "webp" | "pdf";
  size: number;
}

const MAX_SIDE = 2200;

/** Phone photos are often 4–8 MB: shrink big images to a sharp JPEG before uploading. */
async function shrink(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.size < 1.5 * 1024 * 1024) return file;
  try {
    const img = await createImageBitmap(file);
    const k = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * k);
    canvas.height = Math.round(img.height * k);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    return blob ?? file;
  } catch {
    return file;
  }
}

export async function uploadDoc(file: File): Promise<Attachment> {
  const body = new FormData();
  body.append("kind", "doc");
  const blob = await shrink(file);
  body.append("file", blob, blob === file ? file.name : file.name.replace(/\.\w+$/, "") + ".jpg");
  const res = await fetch("/api/uploads", { method: "POST", body });
  const json = (await res.json().catch(() => ({}))) as Partial<Attachment> & { error?: string };
  if (!res.ok || !json.url) throw new Error(json.error ?? "Upload failed");
  return json as Attachment;
}

const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Photos or PDFs of the supplier's bill. `onAdd`/`onRemove` let a page save straight away. */
export function AttachmentsField({ value, onAdd, onRemove, disabled }: { value: Attachment[]; onAdd: (files: Attachment[]) => void | Promise<void>; onRemove: (a: Attachment) => void; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const pick = useRef<HTMLInputElement>(null);
  const shoot = useRef<HTMLInputElement>(null);
  const room = MAX_ATTACHMENTS - value.length;

  async function add(list: FileList | null) {
    const files = [...(list ?? [])];
    if (!files.length) return;
    if (files.length > room) return void toast.error(`You can attach up to ${MAX_ATTACHMENTS} files.`);
    setBusy(true);
    try {
      const done: Attachment[] = [];
      for (const f of files) done.push(await uploadDoc(f));
      await onAdd(done);
    } catch (e) {
      toast.error((e as Error).message || "Upload failed");
    } finally {
      setBusy(false);
      if (pick.current) pick.current.value = "";
      if (shoot.current) shoot.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <ul className="space-y-1.5" aria-label="Attached files">
          {value.map((a) => (
            <li key={a.url} className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm">
              {a.type === "pdf" ? <FileText className="size-4 shrink-0 text-muted-foreground" /> : <ImageIcon className="size-4 shrink-0 text-muted-foreground" />}
              <a href={a.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate hover:underline">{a.name}</a>
              <span className="shrink-0 text-xs text-muted-foreground">{kb(a.size)}</span>
              <Button type="button" variant="ghost" size="icon-xs" aria-label={`Remove ${a.name}`} onClick={() => onRemove(a)} disabled={disabled || busy}>
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {room > 0 && (
        <div className="flex flex-wrap gap-2">
          <input ref={pick} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" multiple hidden onChange={(e) => add(e.target.files)} aria-label="Choose bill files" />
          <input ref={shoot} type="file" accept="image/*" capture="environment" hidden onChange={(e) => add(e.target.files)} aria-label="Take a photo of the bill" />
          <Button type="button" variant="outline" size="sm" onClick={() => pick.current?.click()} disabled={disabled || busy}>
            {busy ? <Spinner /> : <Paperclip />} Add photo or PDF
          </Button>
          <Button type="button" variant="outline" size="sm" className="sm:hidden" onClick={() => shoot.current?.click()} disabled={disabled || busy}>
            <Camera /> Take photo
          </Button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">Photo or PDF of the supplier&apos;s bill, up to 10 MB each. Only your team can open them.</p>
    </div>
  );
}
