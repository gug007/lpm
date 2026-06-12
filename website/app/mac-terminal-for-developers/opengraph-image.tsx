import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-template";

export const alt =
  "lpm — the Mac terminal workspace built for developers who run real stacks.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    headline: ["The Mac terminal workspace", "for real stacks."],
    subline:
      "Replace scattered terminal tabs with a project-aware workspace — per-service logs, instant project switching, native Apple Silicon speed.",
  });
}
