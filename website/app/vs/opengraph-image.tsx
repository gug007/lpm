import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-template";

export const alt =
  "lpm alternatives and comparisons with iTerm2, Foreman, Overmind, Docker Compose, tmux, PM2, and cmux.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    headline: ["Compare lpm with iTerm2, tmux,", "PM2, and more."],
    subline:
      "Honest comparisons of lpm against iTerm2, Foreman, Overmind, Docker Compose, tmux, PM2, and cmux.",
  });
}
