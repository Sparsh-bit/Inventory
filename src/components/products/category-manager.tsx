"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { FolderTree, Pencil, Plus, Trash2 } from "lucide-react";
import { deleteCategory, saveCategory } from "@/server/actions/products";
import { SelectField } from "@/components/app/select-field";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

interface Cat {
  id: string;
  name: string;
  parentId: string | null;
  products: number;
}

export function CategoryManager({ categories }: { categories: Cat[] }) {
  const router = useRouter();
  const save = useAction(saveCategory);
  const del = useAction(deleteCategory);
  const [editing, setEditing] = useState<{ id: string | null; name: string; parentId: string } | null>(null);

  const roots = categories.filter((c) => !c.parentId);
  const children = (id: string) => categories.filter((c) => c.parentId === id);

  const row = (c: Cat, depth: number): React.ReactNode => (
    <div key={c.id}>
      <div className="flex items-center gap-2 border-b px-4 py-2.5 last:border-0" style={{ paddingLeft: `${16 + depth * 24}px` }}>
        <span className="flex-1 truncate">{c.name}</span>
        <span className="text-xs text-muted-foreground">{c.products} products</span>
        <Button variant="ghost" size="icon-sm" aria-label={`Rename ${c.name}`} onClick={() => setEditing({ id: c.id, name: c.name, parentId: c.parentId ?? "none" })}>
          <Pencil />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label={`Delete ${c.name}`} disabled={del.pending} onClick={() => del.run({ id: c.id }, { success: "Category deleted", onSuccess: () => router.refresh() })}>
          <Trash2 />
        </Button>
      </div>
      {children(c.id).map((ch) => row(ch, depth + 1))}
    </div>
  );

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setEditing({ id: null, name: "", parentId: "none" })}>
          <Plus /> New category
        </Button>
      </div>
      <Card className="py-0">
        <CardContent className="p-0">
          {categories.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FolderTree />
                </EmptyMedia>
                <EmptyTitle>No categories yet</EmptyTitle>
                <EmptyDescription>e.g. Groceries, Beverages, Personal care</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            roots.map((c) => row(c, 0))
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit category" : "New category"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                save.run(
                  { id: editing.id, name: editing.name, parentId: editing.parentId === "none" ? null : editing.parentId },
                  { success: "Category saved", onSuccess: () => { setEditing(null); router.refresh(); } },
                );
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="cat-name">Name</Label>
                <Input id="cat-name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} required maxLength={80} autoFocus />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cat-parent">Parent category</Label>
                <SelectField id="cat-parent" value={editing.parentId} onValueChange={(v) => setEditing({ ...editing, parentId: v })} options={[["none", "None (top level)"], ...categories.filter((c) => c.id !== editing.id && !c.parentId).map((c) => [c.id, c.name] as const)]} />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={save.pending}>
                  {save.pending && <Spinner />} Save
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
