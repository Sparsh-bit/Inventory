"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";
import { NAV } from "./nav";
import { useOrg } from "./org-context";

export function CommandMenu() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const org = useOrg();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const actions = [
    { title: "New sale", href: "/pos", permission: "pos:sell" as const, shortcut: "" },
    { title: "New product", href: "/products/new", permission: "products:write" as const },
    { title: "New purchase order", href: "/purchases/new", permission: "purchases:write" as const },
    { title: "New customer", href: "/customers?new=1", permission: "parties:write" as const },
    { title: "Print barcode labels", href: "/products/labels", permission: "products:read" as const },
  ].filter((a) => org.can(a.permission));

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="w-9 justify-start gap-2 px-2 text-muted-foreground sm:w-56">
        <Search className="size-4" />
        <span className="hidden sm:inline">Search…</span>
        <Kbd className="ml-auto hidden sm:inline-flex">⌘K</Kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen} title="Search" description="Jump to a page or action">
        <CommandInput placeholder="Type a page or action…" />
        <CommandList>
          <CommandEmpty>No results.</CommandEmpty>
          <CommandGroup heading="Actions">
            {actions.map((a) => (
              <CommandItem key={a.href} onSelect={() => go(a.href)}>
                <Plus /> {a.title}
              </CommandItem>
            ))}
          </CommandGroup>
          {NAV.map((g) => (
            <CommandGroup key={g.label} heading={g.label}>
              {g.items
                .filter((i) => !i.permission || org.can(i.permission))
                .flatMap((i) => [
                  <CommandItem key={i.href} value={`${i.title} ${i.keywords ?? ""}`} onSelect={() => go(i.href)}>
                    <i.icon /> {i.title}
                  </CommandItem>,
                  ...(i.children ?? [])
                    .filter((c) => c.href !== i.href && (!c.permission || org.can(c.permission)))
                    .map((c) => (
                      <CommandItem key={c.href} value={`${i.title} ${c.title}`} onSelect={() => go(c.href)}>
                        <i.icon /> {c.title}
                        <CommandShortcut>{i.title}</CommandShortcut>
                      </CommandItem>
                    )),
                ])}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}
