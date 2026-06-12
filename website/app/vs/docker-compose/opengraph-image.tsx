import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-template";

export const alt =
  "lpm vs Docker Compose — native dev without container overhead, for running your stack locally.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    headline: "lpm vs Docker Compose",
    subline:
      "Native dev without container overhead — run your Rails, Next.js, Go, or Python stack locally with per-service panes.",
  });
}
