import { APP_WINDOW } from "@/lib/og-app-window";
import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-template";

export const alt =
  "lpm desktop app. Every project. Every agent. One window.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    headline: ["Every project.", "Every agent.", "One window."],
    subline:
      "lpm runs your dev servers and AI coding agents side by side.",
    eyebrow: "Free and open source",
    image: APP_WINDOW,
  });
}
