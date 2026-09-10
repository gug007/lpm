import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-template";

export const alt =
  "Docker Compose alternative for local dev on macOS — lpm vs Compose.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    headline: ["A Docker Compose alternative", "for fast local dev on macOS."],
    subline:
      "Run the stack natively with a pane per service, and keep compose for the containers that earn it.",
  });
}
