import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-template";

export const alt =
  "Git worktrees for Claude Code, Codex, and any coding agent — compared with standalone lpm project copies.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    headline: [
      "Git worktrees for Claude Code,",
      "Codex, and any coding agent.",
    ],
    subline:
      "What a worktree does not carry, what .worktreeinclude copies in, and when a standalone copy is the better boundary.",
    eyebrow: "Parallel agents in lpm",
  });
}
