import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-template";

export const alt =
  "lpm — a terminal for Windows developers who run whole stacks.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    headline: ["A terminal for Windows", "developers running real stacks."],
    subline:
      "Dev servers found in your repo, a log tab for each, and Claude Code and Codex beside them, all in Git Bash on Windows 11.",
    eyebrow: "Terminal for Windows developers",
    platform: "Free · Windows 11 beta",
  });
}
