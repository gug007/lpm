import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-template";

export const alt =
  "lpm — run multiple Claude Code accounts on one Mac, one per project.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    headline: ["Every project on its own", "Claude account."],
    subline:
      "Pin a Claude Code account to each project. Work and personal run in parallel — signed in once, no logout dance, tokens untouched.",
  });
}
