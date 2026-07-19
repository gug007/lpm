import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-template";

export const alt =
  "lpm — the best terminal for Claude Code and Codex, built for parallel agents.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    headline: [
      "The best terminal for Claude Code and Codex",
      "Built for parallel agents.",
    ],
    subline:
      "Run Claude Code and Codex side by side on the same codebase — start your dev stack in one click and keep every agent in view.",
  });
}
