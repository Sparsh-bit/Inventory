"use client";

import { useEffect } from "react";
import { animate, stagger } from "animejs";

export function LandingMotion() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const entrance = animate(".landing-copy > *", {
      opacity: [0, 1],
      translateY: [16, 0],
      delay: stagger(85, { start: 100 }),
      duration: 620,
      ease: "out(3)",
    });
    const preview = animate(".landing-preview", {
      opacity: [0, 1],
      translateY: [22, 0],
      scale: [0.985, 1],
      delay: 180,
      duration: 900,
      ease: "out(3)",
    });

    return () => {
      entrance.pause();
      preview.pause();
    };
  }, []);

  return null;
}
