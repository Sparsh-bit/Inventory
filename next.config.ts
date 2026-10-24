import type { NextConfig } from "next";

// Every app page is per-tenant and per-request, so Cache Components (which forces
// Suspense around every session read) buys nothing here; pages render dynamically.
const nextConfig: NextConfig = {
  // Keep E2E production builds separate from a concurrent local dev server's .next directory.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  poweredByHeader: false,
  serverExternalPackages: ["mongoose", "mongodb", "exceljs", "bwip-js"],
  experimental: {
    serverActions: { bodySizeLimit: "6mb" },
    // The persistent Turbopack cache breaks when macOS writes "._*" metadata files into it
    // (exFAT/external drives). Builds are a little slower without it, but always reliable.
    turbopackFileSystemCacheForDev: false,
    turbopackFileSystemCacheForBuild: false,
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
