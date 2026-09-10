import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-template";

export const alt =
  "A cmux alternative that runs Claude Code and Codex on whole projects.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    headline: [
      "A cmux alternative that runs",
      "Claude Code and Codex on projects.",
    ],
    subline:
      "Services, per-tab agent status, and one prompt fanned out to 50 project copies. Both free, both macOS.",
  });
}
