import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FEATURES_PATH } from "@/lib/links";
import { FEATURE_COUNT } from "../_components/feature-areas";
import FeatureRedirect from "../_components/feature-redirect";
import {
  findSharedFeature,
  firstSentence,
  sharedFeatureSlugs,
} from "../_components/feature-share";

type Props = { params: Promise<{ feature: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return sharedFeatureSlugs().map((feature) => ({ feature }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { feature } = await params;
  const entry = findSharedFeature(feature);
  if (!entry) return {};
  const title = `${entry.title} — lpm`;
  const description = firstSentence(entry.body);
  return {
    title: { absolute: title },
    description,
    robots: { index: false, follow: true },
    alternates: { canonical: FEATURES_PATH },
    openGraph: {
      title,
      description,
      type: "website",
      url: `${FEATURES_PATH}/${feature}`,
      siteName: "lpm",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function SharedFeaturePage({ params }: Props) {
  const entry = findSharedFeature((await params).feature);
  if (!entry) notFound();
  const target = `${FEATURES_PATH}#${entry.id}`;
  return (
    <section className="mx-auto max-w-2xl px-6 py-24 text-center sm:py-32">
      <FeatureRedirect to={target} />
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">
        lpm features · {entry.areaLabel}
      </p>
      <h1 className="mt-3 text-balance text-4xl font-bold tracking-tight text-gray-900 dark:text-white">
        {entry.title}
      </h1>
      <p className="mt-4 text-pretty text-lg leading-relaxed text-gray-600 dark:text-gray-400">
        {entry.body}
      </p>
      <Link
        href={target}
        className="mt-8 inline-flex min-h-11 items-center rounded-full bg-gray-900 px-5 text-sm font-medium text-white transition-colors hover:bg-gray-700 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
      >
        See it with all {FEATURE_COUNT} features
      </Link>
    </section>
  );
}
