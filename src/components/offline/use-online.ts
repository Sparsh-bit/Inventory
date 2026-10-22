"use client";
import { useSyncExternalStore } from "react";

function subscribe(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

/** Browser connectivity (true on the server render). */
export function useOnline() {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
}

/** True when a server action failed because the network is down (not a server-side error). */
export function isNetworkError(e: unknown) {
  return e instanceof TypeError || (typeof navigator !== "undefined" && !navigator.onLine);
}
