import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-template";

export const alt = "lpm — a Linux terminal for developers who run whole stacks.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    headline: ["A Linux terminal for", "developers running real stacks."],
    subline:
      "Dev servers found in your repo, a log tab for each, and Claude Code and Codex beside them. As a .deb, .rpm or AppImage.",
    eyebrow: "Terminal for Linux developers",
    platform: "Free · Linux x86-64 beta",
  });
}
