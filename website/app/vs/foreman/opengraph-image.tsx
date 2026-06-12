import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-template";

export const alt =
  "lpm vs Foreman — a modern Procfile experience with per-service panes, a desktop app, and multi-project switching.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    headline: "lpm vs Foreman",
    subline:
      "Keep the Procfile-style ergonomics — get per-service panes, a desktop app, and multi-project switching.",
  });
}
