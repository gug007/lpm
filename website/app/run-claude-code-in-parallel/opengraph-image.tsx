import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-template";

export const alt =
  "Run Claude Code in parallel with lpm: agent tabs, project copies and Git worktrees, with live status for every Claude Code and Codex session.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    headline: ["Run Claude Code", "in parallel."],
    subline:
      "Tabs, project copies or Git worktrees — with live status for every Claude Code and Codex session and every diff one shortcut away.",
  });
}
