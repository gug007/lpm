import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-template";

export const alt =
  "A Docker Compose alternative for fast native development without container overhead.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    headline: ["A Docker Compose alternative", "for fast native development."],
    subline:
      "Native dev without container overhead — run your Rails, Next.js, Go, or Python stack locally with per-service panes.",
  });
}
