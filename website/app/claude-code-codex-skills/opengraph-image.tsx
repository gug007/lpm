import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-template";

export const alt =
  "lpm — create and edit Claude Code and Codex skills with AI drafting and visible context cost.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    headline: ["Create Claude Code and Codex skills", "Without hand-writing SKILL.md."],
    subline:
      "One dialog to create and edit agent skills — AI drafts the fields, and every skill shows its context cost.",
  });
}
