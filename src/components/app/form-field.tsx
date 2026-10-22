"use client";
import { useId, type ReactElement, cloneElement } from "react";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";

/** Label + control + description + error, wired for accessibility. */
export function FormField({
  label,
  description,
  error,
  children,
  className,
  optional,
}: {
  label: string;
  description?: string;
  error?: string[] | string;
  children: ReactElement<{ id?: string; "aria-invalid"?: boolean; "aria-describedby"?: string }>;
  className?: string;
  optional?: boolean;
}) {
  const id = useId();
  const errors = (Array.isArray(error) ? error : error ? [error] : []).map((message) => ({ message }));
  return (
    <Field data-invalid={errors.length > 0 || undefined} className={className}>
      <FieldLabel htmlFor={id}>
        {label}
        {optional && <span className="font-normal text-muted-foreground">(optional)</span>}
      </FieldLabel>
      {cloneElement(children, { id, "aria-invalid": errors.length > 0 || undefined, "aria-describedby": description ? `${id}-d` : undefined })}
      {description && <FieldDescription id={`${id}-d`}>{description}</FieldDescription>}
      <FieldError errors={errors} />
    </Field>
  );
}
