"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { SelectField } from "./select-field";

function useSetParam() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const set = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("page");
    start(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }));
  };
  return { set, params, pending };
}

export function SearchInput({ placeholder = "Search…", param = "q", className = "w-full sm:w-72" }: { placeholder?: string; param?: string; className?: string }) {
  const { set, params, pending } = useSetParam();
  const [value, setValue] = useState(params.get(param) ?? "");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <InputGroup className={className}>
      <InputGroupAddon>{pending ? <Spinner /> : <Search />}</InputGroupAddon>
      <InputGroupInput
        type="search"
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          clearTimeout(timer.current);
          const v = e.target.value.trim();
          timer.current = setTimeout(() => set({ [param]: v || null }), 300);
        }}
      />
      {value && (
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="icon-xs" aria-label="Clear search" onClick={() => { setValue(""); set({ [param]: null }); }}>
            <X />
          </InputGroupButton>
        </InputGroupAddon>
      )}
    </InputGroup>
  );
}

export function FilterSelect({ param, options, placeholder, className = "w-full sm:w-44" }: { param: string; options: { value: string; label: string }[]; placeholder: string; className?: string }) {
  const { set, params } = useSetParam();
  return (
    <SelectField
      aria-label={placeholder}
      className={className}
      value={params.get(param) ?? "all"}
      onValueChange={(v) => set({ [param]: v === "all" ? null : v })}
      options={[{ value: "all", label: placeholder }, ...options]}
    />
  );
}

export function Pagination({ page, pageSize, total, searchParams }: { page: number; pageSize: number; total: number; searchParams: Record<string, string | string[] | undefined> }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) if (typeof v === "string" && k !== "page") q.set(k, v);
    if (p > 1) q.set("page", String(p));
    return `?${q}`;
  };
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  return (
    <div className="flex items-center justify-between gap-3 pt-4 text-sm text-muted-foreground">
      <span className="tabular-nums">
        {from}–{Math.min(total, page * pageSize)} of {total}
      </span>
      <div className="flex gap-1">
        <Button variant="outline" size="icon-sm" asChild={page > 1} disabled={page <= 1} aria-label="Previous page">
          {page > 1 ? (
            <Link href={href(page - 1)}>
              <ChevronLeft />
            </Link>
          ) : (
            <ChevronLeft />
          )}
        </Button>
        <Button variant="outline" size="icon-sm" asChild={page < pages} disabled={page >= pages} aria-label="Next page">
          {page < pages ? (
            <Link href={href(page + 1)}>
              <ChevronRight />
            </Link>
          ) : (
            <ChevronRight />
          )}
        </Button>
      </div>
    </div>
  );
}

