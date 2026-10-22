"use client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Radix Select whose trigger receives the label's id (use inside FormField). */
export function SelectField({
  id,
  value,
  onValueChange,
  options,
  placeholder,
  name,
  disabled,
  className = "w-full",
  ...aria
}: {
  id?: string;
  value: string;
  onValueChange: (v: string) => void;
  options: readonly (readonly [string, string])[] | { value: string; label: string }[];
  placeholder?: string;
  name?: string;
  disabled?: boolean;
  className?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  "aria-label"?: string;
}) {
  const opts = options.map((o) => (Array.isArray(o) ? { value: o[0], label: o[1] } : (o as { value: string; label: string })));
  return (
    <Select value={value} onValueChange={onValueChange} name={name} disabled={disabled}>
      <SelectTrigger id={id} className={className} {...aria}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {opts.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
