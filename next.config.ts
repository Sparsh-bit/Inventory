import type { NextConfig } from "next";

// Every app page is per-tenant and per-request, so Cache Components (which forces
// Suspense around every session read) buys nothing here; pages render dynamically.
const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["mongoose", "mongodb", "exceljs", "bwip-js"],
  experimental: {
    serverActions: { bodySizeLimit: "6mb" },
    // The persistent Turbopack cache breaks when macOS writes "._*" metadata files into it
    // (exFAT/external drives). Builds are a little slower without it, but always reliable.
    turbopackFileSystemCacheForDev: false,
    turbopackFileSystemCacheForBuild: false,
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
