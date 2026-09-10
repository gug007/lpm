import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-template";

export const alt =
  "A PM2 alternative for local development — and what to keep PM2 for.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    headline: ["A PM2 alternative for local dev", "— and what to keep PM2 for."],
    subline:
      "A live pane per service you can read and search, plus the six things PM2 does that lpm does not.",
  });
}
