import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-template";

export const alt =
  "lpm Automations: schedule Claude Code and Codex to run nightly, on weekdays, or every few hours on your Mac.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    headline: ["Schedule Claude Code", "and Codex runs."],
    subline:
      "Nightly, weekday or interval runs in your project, a fresh copy or a Git worktree, with answers you can read and reply to.",
  });
}
