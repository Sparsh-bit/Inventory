import type { NextConfig } from "next";

// Every app page is per-tenant and per-request, so Cache Components (which forces
// Suspense around every session read) buys nothing here; pages render dynamically.
const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["mongoose", "mongodb", "exceljs", "bwip-js"],
  experimental: {
    serverActions: { bodySizeLimit: "6mb" },
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
