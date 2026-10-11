import { ImageResponse } from "next/og";
import { OgCard } from "@/components/og/OgCard";

// File-convention OpenGraph image. Replaces the previously-referenced (and
// missing) /og-image.png. Next serves this at build/first-request and caches it.
export const alt = "Belay — Milestone Escrow on the Stellar Blockchain";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(<OgCard />, { ...size });
}
