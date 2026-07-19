import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-template";

export const alt =
  "A cmux terminal alternative with project-level control for AI coding agents.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    headline: ["A cmux terminal alternative", "that manages whole projects."],
    subline:
      "Both target Mac developers running AI coding agents — lpm manages projects, cmux is the terminal. An honest side-by-side.",
  });
}
