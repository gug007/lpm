import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-template";

export const alt =
  "lpm — review every change before you commit, without leaving your terminal.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    headline: ["Review every change,", "without leaving the terminal."],
    subline:
      "A full file-by-file diff review built into your workspace — beside your running services and the AI agents editing your code.",
  });
}
