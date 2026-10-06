import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-template";

export const alt =
  "lpm desktop app. Start projects in one click. Run AI agents in parallel.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    headline: ["Start projects in one click.", "Run AI agents in parallel."],
    subline:
      "A free desktop app for managing local dev projects — run Claude Code, Codex, and more side by side on the same codebase.",
  });
}
