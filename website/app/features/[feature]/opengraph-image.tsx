import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-template";
import {
  findSharedFeature,
  firstSentence,
  sharedFeatureSlugs,
} from "../_components/feature-share";

export const alt = "A feature of lpm";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export function generateStaticParams() {
  return sharedFeatureSlugs().map((feature) => ({ feature }));
}

export default async function Image({
  params,
}: {
  params: Promise<{ feature: string }>;
}) {
  const entry = findSharedFeature((await params).feature);
  return ogImage({
    headline: entry?.title ?? "lpm features",
    subline: entry ? firstSentence(entry.body) : "",
    eyebrow: entry ? `Features · ${entry.areaLabel}` : "Features",
  });
}
