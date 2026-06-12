import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-template";

export const alt =
  "lpm — the native macOS terminal for Claude Code and Codex.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    headline: ["The native macOS terminal", "for Claude Code and Codex."],
    subline:
      "Run Claude Code and Codex side by side on the same codebase — start your dev stack in one click and keep every agent in view.",
  });
}
