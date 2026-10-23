import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = ["/", "/manifest.webmanifest", "/apple-icon", "/sign-in", "/sign-up", "/forgot-password", "/reset-password", "/verify-email", "/two-factor", "/forbidden"];
const SESSION_COOKIES = ["better-auth.session_token", "__Secure-better-auth.session_token"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Optimistic gate only (real checks happen server-side on every page and action).
  const isPublic = PUBLIC.includes(pathname) || pathname.startsWith("/accept-invite/") || pathname.startsWith("/bill/") || pathname.startsWith("/icon");
  const hasSession = SESSION_COOKIES.some((c) => request.cookies.has(c));
  if (!isPublic && !hasSession && !pathname.startsWith("/api/")) {
    const url = new URL("/sign-in", request.url);
    if (pathname !== "/dashboard") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'", // Radix sets inline style attributes; nonces can't cover those
    "img-src 'self' blob: data:",
    "font-src 'self' data:",
    "media-src 'self' blob:",
    // print-bridge runs on the shop PC; Chrome allows https -> http://127.0.0.1
    "connect-src 'self' http://127.0.0.1:9123 http://localhost:9123",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'", // print pages load in a same-origin iframe
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(self), usb=(self), serial=(self), bluetooth=(self), microphone=(), geolocation=(), payment=()");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  // Behind Railway/other proxies TLS ends at the edge, so trust x-forwarded-proto too.
  const https = request.nextUrl.protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
  if (https) response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|manifest.webmanifest|sw.js).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
