import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-template";

export const alt =
  "lpm — the Mac terminal that keeps git and your dev servers in the same window.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    headline: ["Git and your dev servers,", "in the same window."],
    subline:
      "Branch, rebase, and push right next to live service logs — no toggling between a git client and a separate terminal.",
  });
}
