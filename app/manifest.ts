import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Belay — Milestone Escrow on Stellar",
    short_name: "Belay",
    description:
      "Fund freelance work in escrow, release milestones as they're approved. Non-custodial, on-chain, verifiable.",
    id: "/",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0F0F14",
    theme_color: "#B9FF66",
    categories: ["finance", "productivity", "business"],
    icons: [
      { src: "/pwa-icon?size=192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon?size=512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon?size=192&mask=1", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/pwa-icon?size=512&mask=1", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Dashboard", url: "/dashboard" },
      { name: "Agreements", url: "/agreements" },
      { name: "New Agreement", url: "/agreements/new" },
    ],
  };
}
