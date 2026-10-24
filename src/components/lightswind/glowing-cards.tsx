"use client";

import React, { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export interface GlowingCardProps {
  children: React.ReactNode;
  className?: string;
  glowColor?: string;
  hoverEffect?: boolean;
}

export interface GlowingCardsProps {
  children: React.ReactNode;
  className?: string;
  enableGlow?: boolean;
  glowRadius?: number;
  glowOpacity?: number;
  animationDuration?: number;
  enableHover?: boolean;
  gap?: string;
  maxWidth?: string;
  padding?: string;
  responsive?: boolean;
  customTheme?: React.CSSProperties;
}

export function GlowingCard({ children, className, glowColor = "#7287ef", hoverEffect = true, ...props }: GlowingCardProps) {
  return (
    <div
      className={cn(
        "relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border/70 bg-card p-6 text-card-foreground transition-all duration-300",
        hoverEffect && "hover:-translate-y-1 hover:shadow-lg",
        className,
      )}
      style={{ "--glow-color": glowColor } as React.CSSProperties}
      {...props}
    >
      {children}
    </div>
  );
}

export function GlowingCards({
  children,
  className,
  enableGlow = true,
  glowRadius = 13,
  glowOpacity = 0.13,
  animationDuration = 220,
  enableHover = true,
  gap = "1rem",
  maxWidth = "88rem",
  padding = "0",
  responsive = true,
  customTheme,
}: GlowingCardsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const overlay = overlayRef.current;
    if (!container || !overlay || !enableGlow) return;

    const onPointerMove = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      overlay.style.setProperty("--x", `${event.clientX - rect.left}px`);
      overlay.style.setProperty("--y", `${event.clientY - rect.top}px`);
      overlay.style.opacity = String(glowOpacity);
    };
    const onPointerLeave = () => {
      overlay.style.opacity = "0";
    };

    container.addEventListener("pointermove", onPointerMove, { passive: true });
    container.addEventListener("pointerleave", onPointerLeave);
    return () => {
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerleave", onPointerLeave);
    };
  }, [enableGlow, glowOpacity]);

  const cards = React.Children.map(children, (child) => {
    if (!React.isValidElement<GlowingCardProps>(child) || child.type !== GlowingCard) return child;
    return React.cloneElement(child, {
      className: cn(child.props.className, enableHover && "hover:border-primary/25"),
    });
  });

  const variables = {
    "--cards-gap": gap,
    "--cards-max-width": maxWidth,
    "--cards-padding": padding,
    "--glow-radius": `${glowRadius}rem`,
    "--glow-duration": `${animationDuration}ms`,
    ...customTheme,
  } as React.CSSProperties;

  return (
    <div className={cn("relative w-full", className)} style={variables}>
      <div ref={containerRef} className="relative mx-auto max-w-[var(--cards-max-width)]" style={{ padding: "var(--cards-padding)" }}>
        <div className={cn("flex flex-wrap justify-center gap-[var(--cards-gap)]", responsive && "flex-col sm:flex-row")}>{cards}</div>
        {enableGlow && (
          <div
            ref={overlayRef}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-0 transition-opacity"
            style={{
              transitionDuration: "var(--glow-duration)",
              background: "radial-gradient(circle var(--glow-radius) at var(--x, 50%) var(--y, 50%), color-mix(in oklab, var(--primary) 10%, transparent), transparent)",
            }}
          />
        )}
      </div>
    </div>
  );
}

export default GlowingCards;
