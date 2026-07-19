import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-template";

export const alt =
  "A tmux alternative for Mac that runs local dev stacks in panes without configuration.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    headline: ["A tmux alternative for Mac", "built for local dev stacks."],
    subline:
      "tmux-level visibility with one-click start for your local dev stack — an honest, per-workflow comparison.",
  });
}
