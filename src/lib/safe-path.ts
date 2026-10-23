/**
 * Same-site path to return to after sign-in, or null. Rejects "//evil", "/\\evil", tabs and other
 * tricks browsers turn into an external URL.
 */
export function safePath(p: unknown): string | null {
  if (typeof p !== "string" || p.length > 300 || !p.startsWith("/") || /[\\\u0000-\u001f\u007f]/.test(p)) return null;
  try {
    const u = new URL(p, "http://x");
    return u.origin === "http://x" ? u.pathname + u.search + u.hash : null;
  } catch {
    return null;
  }
}
