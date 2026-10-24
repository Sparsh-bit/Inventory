"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { animate, stagger } from "animejs";

export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="page-header mb-7 space-y-2.5">
      {back && (
        <Link href={back.href} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="truncate text-2xl font-semibold tracking-[-0.035em] sm:text-[1.75rem]">{title}</h1>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function PageBody({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !bodyRef.current) return;
    const targets = Array.from(bodyRef.current.children) as HTMLElement[];
    if (!targets.length) return;
    const entrance = animate(targets, {
      opacity: [0, 1],
      translateY: [9, 0],
      delay: stagger(55),
      duration: 400,
      ease: "out(3)",
    });
    return () => {
      entrance.pause();
    };
  }, [pathname]);

  return <div ref={bodyRef} className={`page-body mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8 ${className}`}>{children}</div>;
}
