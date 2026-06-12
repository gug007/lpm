import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-template";

export const alt =
  "lpm configuration reference — services, actions, terminals, profiles, and global config.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    headline: "Configuration Reference",
    subline:
      "Everything you can put in a project config — services, actions, terminals, profiles, and global settings.",
  });
}
