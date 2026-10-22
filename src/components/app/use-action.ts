"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/server/with-auth";

/** Runs a server action, tracks pending state and field errors, toasts failures. */
export function useAction<I, T>(action: (input: I) => Promise<ActionResult<T>>) {
  const [pending, start] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  function run(input: I, opts: { success?: string; onSuccess?: (data: T) => void; onError?: (error: string) => void } = {}) {
    start(async () => {
      let res: ActionResult<T>;
      try {
        res = await action(input);
      } catch {
        res = { ok: false, error: "Network error. Check your connection and try again." };
      }
      if (res.ok) {
        setFieldErrors({});
        if (opts.success) toast.success(opts.success);
        opts.onSuccess?.(res.data);
      } else {
        setFieldErrors(res.fieldErrors ?? {});
        toast.error(res.error);
        opts.onError?.(res.error);
      }
    });
  }
  return { run, pending, fieldErrors, setFieldErrors };
}
