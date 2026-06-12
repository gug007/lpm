import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-template";

export const alt =
  "lpm vs Overmind — per-process control with live panes, single-service restarts, and multi-project switching in a native macOS app.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    headline: "lpm vs Overmind",
    subline:
      "Overmind-grade per-process control — live panes, single-service restarts, and multi-project switching in a native macOS app.",
  });
}
