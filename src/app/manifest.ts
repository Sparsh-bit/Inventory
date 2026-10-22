import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "StockPilot — Inventory & POS",
    short_name: "StockPilot",
    description: "Inventory, billing and point of sale for every kind of business.",
    start_url: "/pos",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#4a3fd6",
    orientation: "any",
    icons: [
      { src: "/icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "New sale", url: "/pos" },
      { name: "Products", url: "/products" },
    ],
  };
}
