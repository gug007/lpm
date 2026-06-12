import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-template";

export const alt =
  "How lpm compares — side-by-side comparisons against Foreman, Overmind, Docker Compose, tmux, PM2, and cmux.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    headline: "How lpm compares",
    subline:
      "Honest comparisons of lpm against Foreman, Overmind, Docker Compose, tmux, PM2, and cmux.",
  });
}
