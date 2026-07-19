import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-template";

export const alt =
  "lpm alternatives and comparisons with Foreman, Overmind, Docker Compose, tmux, PM2, and cmux.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    headline: ["Compare lpm with tmux, cmux,", "PM2, and more."],
    subline:
      "Honest comparisons of lpm against Foreman, Overmind, Docker Compose, tmux, PM2, and cmux.",
  });
}
