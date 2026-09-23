import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-template";

export const alt =
  "What lpm does: dev servers, Claude Code and Codex terminals, parallel copies, Git review, automations, and iPhone control.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    headline: ["What lpm does,", "on one page."],
    subline:
      "Dev servers, Claude Code and Codex terminals, parallel copies, Git review, automations, and control from your iPhone.",
  });
}
