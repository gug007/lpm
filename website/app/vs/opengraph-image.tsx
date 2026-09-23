import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-template";

export const alt =
  "Run a Mac dev stack: tmux vs PM2 vs Docker Compose — seven tools compared.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    headline: ["tmux, iTerm2, PM2, Docker Compose:", "seven ways to run a Mac dev stack."],
    subline:
      "Seven tools and lpm in one table, an honest verdict on each, and the two rows that go against lpm.",
  });
}
