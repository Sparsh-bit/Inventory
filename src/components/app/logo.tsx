import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-8", className)}>
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <path d="M8 11.5 16 7l8 4.5v9L16 25l-8-4.5z" fill="none" className="stroke-primary-foreground" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M8 11.5 16 16l8-4.5M16 16v9" fill="none" className="stroke-primary-foreground" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <LogoMark className="size-7" />
      StockPilot
    </span>
  );
}
