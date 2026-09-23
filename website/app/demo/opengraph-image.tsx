import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-template";

export const alt = "Try the lpm interactive demo in your browser.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    headline: ["Try lpm", "in your browser"],
    subline:
      "An empty workspace: add a project, start it, and open Claude Code and Codex.",
  });
}
