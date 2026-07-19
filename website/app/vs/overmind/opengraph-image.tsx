import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-template";

export const alt =
  "An Overmind alternative for Mac with Procfile control and no tmux requirement.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    headline: ["An Overmind alternative for Mac", "without the tmux requirement."],
    subline:
      "Overmind-grade per-process control — live panes, single-service restarts, and multi-project switching in a native macOS app.",
  });
}
