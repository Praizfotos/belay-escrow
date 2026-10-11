import { ImageResponse } from "next/og";
import { OgCard } from "@/components/og/OgCard";

export const alt = "Belay — Milestone Escrow on the Stellar Blockchain";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function TwitterImage() {
  return new ImageResponse(<OgCard />, { ...size });
}
