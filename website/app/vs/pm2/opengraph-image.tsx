import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-template";

export const alt =
  "A PM2 alternative for local development with per-service panes and project switching.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    headline: ["A PM2 alternative", "for local development."],
    subline:
      "PM2 keeps Node apps alive in production. lpm runs your dev loop — per-service panes, project switching, AI-agent workflows.",
  });
}
