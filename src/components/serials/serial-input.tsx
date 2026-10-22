"use client";
import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";

/**
 * Chips editor for serial numbers / IMEIs. Type + Enter (or paste a list). Hardware scans are
 * routed here by the parent page's scanner handler via `onAdd`.
 */
export function SerialInput({
  value,
  onChange,
  expected,
  label,
  suggestions = [],
  onFocus,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  expected?: number;
  label: string;
  suggestions?: string[];
  onFocus?: () => void;
}) {
  const [text, setText] = useState("");
  const add = (raw: string) => {
    const items = raw.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    if (!items.length) return;
    const dupes = items.filter((s) => value.includes(s));
    if (dupes.length) toast.error(`Already added: ${dupes.join(", ")}`);
    onChange([...value, ...items.filter((s) => !value.includes(s))]);
    setText("");
  };
  const remaining = suggestions.filter((s) => !value.includes(s));
  return (
    <div className="space-y-1.5">
      <div className="flex min-h-9 flex-wrap items-center gap-1 rounded-lg border bg-background px-2 py-1 focus-within:ring-3 focus-within:ring-ring/50">
        {value.map((s) => (
          <span key={s} className="inline-flex items-center gap-1 rounded-md bg-secondary px-1.5 py-0.5 font-mono text-xs">
            {s}
            <button type="button" aria-label={`Remove serial ${s}`} onClick={() => onChange(value.filter((x) => x !== s))} className="text-muted-foreground hover:text-foreground">
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          aria-label={label}
          value={text}
          onFocus={onFocus}
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => {
            const t = e.clipboardData.getData("text");
            if (/[\s,;]/.test(t.trim())) {
              e.preventDefault();
              add(t);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add(text);
            } else if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
          }}
          onBlur={() => text.trim() && add(text)}
          placeholder={value.length ? "" : "Scan or type serial / IMEI, then Enter"}
          className="min-w-32 flex-1 bg-transparent py-0.5 font-mono text-sm outline-none placeholder:font-sans placeholder:text-muted-foreground"
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-1 text-xs text-muted-foreground">
        {expected !== undefined && <span className={value.length === expected ? "text-success" : ""}>{value.length} of {expected} entered</span>}
        {remaining.length > 0 && (
          <span className="flex flex-wrap gap-1">
            In stock:
            {remaining.slice(0, 12).map((s) => (
              <button key={s} type="button" onClick={() => onChange([...value, s])} className="rounded border px-1 font-mono hover:bg-muted">{s}</button>
            ))}
            {remaining.length > 12 && <span>+{remaining.length - 12} more</span>}
          </span>
        )}
      </div>
    </div>
  );
}
