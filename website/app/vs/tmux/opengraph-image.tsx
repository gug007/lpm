import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-template";

export const alt =
  "lpm vs tmux — tmux-level visibility with one-click start for your local dev stack.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    headline: "lpm vs tmux",
    subline:
      "tmux-level visibility with one-click start for your local dev stack — an honest, per-workflow comparison.",
  });
}
