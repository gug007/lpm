import { APP_WINDOW } from "@/lib/og-app-window";
import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-template";

export const alt = "Try the lpm interactive demo in your browser.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    headline: ["Try lpm", "in your browser"],
    subline:
      "Sample projects with services and agents, or an empty workspace like a fresh install.",
    eyebrow: "Interactive demo",
    image: APP_WINDOW,
  });
}
