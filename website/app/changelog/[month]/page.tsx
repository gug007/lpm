import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { DownloadFooter } from "@/components/download-footer";
import { getChangelogReleases } from "@/lib/changelog";
import {
  changelogDays,
  daysByMonth,
  monthLabel,
  monthPath,
  releaseCount,
  releasesText,
} from "@/lib/changelog-days";
import { CHANGELOG_PATH, REPO_URL } from "@/lib/links";
import { breadcrumbJsonLd, jsonLdString, webPageJsonLd } from "@/lib/structured-data";
import { ChangelogEntry } from "../_components/changelog-entry";

export const revalidate = 3600;

type Props = { params: Promise<{ month: string }> };

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

const NAV_LINK =
  "inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white";

async function changelogByMonth() {
  return daysByMonth(changelogDays(await getChangelogReleases()));
}

export async function generateStaticParams() {
  return [...(await changelogByMonth()).keys()].map((month) => ({ month }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { month } = await params;
  if (!MONTH.test(month)) return {};
  const title = `Changelog: ${monthLabel(month)}`;
  const description = `Every lpm release from ${monthLabel(month)}, with what changed in each version of the free desktop app.`;
  return {
    title,
    description,
    alternates: { canonical: monthPath(month) },
    openGraph: { title, description, type: "website", url: monthPath(month), siteName: "lpm" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function ChangelogMonthPage({ params }: Props) {
  const { month } = await params;
  if (!MONTH.test(month)) notFound();
  const byMonth = await changelogByMonth();
  const days = byMonth.get(month);
  if (!days) notFound();

  const order = [...byMonth.keys()];
  const at = order.indexOf(month);
  const newer = order[at - 1];
  const older = order[at + 1];
  const label = monthLabel(month);
  const structuredData = [
    webPageJsonLd({
      title: `Changelog: ${label}`,
      description: `Every lpm release from ${label}.`,
      path: monthPath(month),
      dateModified: days[0].date,
    }),
    breadcrumbJsonLd([
      { name: "Home", path: "/" },
      { name: "Changelog", path: CHANGELOG_PATH },
      { name: label, path: monthPath(month) },
    ]),
  ];

  return (
    <article className="max-w-3xl mx-auto px-6 pt-28 pb-16 sm:pt-32 sm:pb-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(structuredData) }}
      />
      <header>
        <Link href={CHANGELOG_PATH} className={NAV_LINK}>
          <ArrowLeft aria-hidden className="h-4 w-4" />
          Changelog
        </Link>
        <h1 className="mt-4 text-3xl sm:text-4xl font-bold tracking-tight">
          lpm changelog: {label}
        </h1>
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          {releasesText(releaseCount(days))}
        </p>
      </header>

      <ol className="mt-12 space-y-10">
        {days.map((day) => (
          <ChangelogEntry key={day.date} day={day} />
        ))}
      </ol>

      <nav
        aria-label="Other months"
        className="mt-14 flex justify-between gap-4 border-t border-gray-200 pt-6 dark:border-gray-800"
      >
        {older ? (
          <Link href={monthPath(older)} className={NAV_LINK}>
            <ArrowLeft aria-hidden className="h-4 w-4" />
            {monthLabel(older)}
          </Link>
        ) : (
          <span />
        )}
        {newer && (
          <Link href={monthPath(newer)} className={NAV_LINK}>
            {monthLabel(newer)}
            <ArrowRight aria-hidden className="h-4 w-4" />
          </Link>
        )}
      </nav>

      <DownloadFooter href={`${REPO_URL}/releases`} label="All releases on GitHub" />
    </article>
  );
}
