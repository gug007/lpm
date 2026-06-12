import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-template";

export const alt =
  "lpm — the SSH terminal for Mac that makes remote dev boxes feel local.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    headline: ["The SSH terminal that makes", "remote dev boxes feel local."],
    subline:
      "Import your SSH hosts, forward remote ports to localhost, and run remote services beside your local stack in one native window.",
  });
}
