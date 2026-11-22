import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-template";

export const alt = "A live terminal tab shared from lpm";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    headline: ["Join a live", "terminal tab"],
    subline:
      "Someone shared a terminal from lpm. Open it in the app or in your browser, and they let you in.",
    eyebrow: "Shared tab",
  });
}
