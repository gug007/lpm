import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-template";

export const alt =
  "lpm — review code changes before you commit, without leaving your terminal.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    headline: ["Review code changes,", "without leaving the terminal."],
    subline:
      "A full file-by-file diff review built into your workspace — beside your running services and the AI agents editing your code.",
  });
}
