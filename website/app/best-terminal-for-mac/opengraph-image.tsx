import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-template";

export const alt =
  "lpm — the best terminal for Mac, built natively for Apple Silicon.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    headline: ["The best terminal for Mac,", "built for Apple Silicon."],
    subline:
      "A native macOS app that runs your whole dev stack in one window — live output per service, visual project switching, no Electron.",
  });
}
