import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-template";

export const alt =
  "lpm vs PM2 — PM2 keeps Node apps alive in production, lpm runs your dev loop.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    headline: "lpm vs PM2",
    subline:
      "PM2 keeps Node apps alive in production. lpm runs your dev loop — per-service panes, project switching, AI-agent workflows.",
  });
}
