"use client";
import { useEffect } from "react";

/** Registers the service worker in production and warms its cache with already-loaded assets. */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => {
        const urls = performance.getEntriesByType("resource").map((e) => e.name).filter((u) => u.startsWith(location.origin) && u.includes("/_next/static/"));
        reg.active?.postMessage({ type: "precache", urls });
      })
      .catch(() => undefined);
  }, []);
  return null;
}

export function clearOfflinePages() {
  navigator.serviceWorker?.controller?.postMessage({ type: "clear-pages" });
}
