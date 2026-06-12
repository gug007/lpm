import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-template";

export const alt =
  "lpm vs cmux — both built for Mac developers running AI coding agents; lpm manages projects, cmux is the terminal.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    headline: "lpm vs cmux",
    subline:
      "Both target Mac developers running AI coding agents — lpm manages projects, cmux is the terminal. An honest side-by-side.",
  });
}
