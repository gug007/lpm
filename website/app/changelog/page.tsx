import type { Metadata } from "next";
import { DownloadFooter } from "@/components/download-footer";
import { changelogDays, getChangelogReleases } from "@/lib/changelog";
import { CHANGELOG_PATH, REPO_URL } from "@/lib/links";
import { breadcrumbJsonLd, jsonLdString, webPageJsonLd } from "@/lib/structured-data";
import { ChangelogEntry } from "./_components/changelog-entry";

export const revalidate = 3600;

const TITLE = "Changelog";
const DESCRIPTION =
  "What’s new in lpm, release by release: a short description of every version of the free desktop app for macOS, Windows and Linux, newest first.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: {
    canonical: CHANGELOG_PATH,
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    url: CHANGELOG_PATH,
    siteName: "lpm",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

const monthFmt = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const fullDateFmt = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

export default async function ChangelogPage() {
  const releases = await getChangelogReleases();
  const days = changelogDays(releases);
  const months = [...Map.groupBy(days, (day) => day.date.slice(0, 7))];
  const firstDate = days[days.length - 1].date;
  const structuredData = [
    webPageJsonLd({
      title: TITLE,
      description: DESCRIPTION,
      path: CHANGELOG_PATH,
      dateModified: days[0].date,
    }),
    breadcrumbJsonLd([
      { name: "Home", path: "/" },
      { name: "Changelog", path: CHANGELOG_PATH },
    ]),
  ];

  return (
    <article className="max-w-3xl mx-auto px-6 pt-28 pb-16 sm:pt-32 sm:pb-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(structuredData) }}
      />
      <header>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
          lpm changelog
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
          What changed in each release of the lpm desktop app. Releases that
          shipped on the same day are listed together under the newest one.
        </p>
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          {releases.length} releases since{" "}
          {fullDateFmt.format(new Date(firstDate))}
        </p>
      </header>

      {months.map(([month, monthDays]) => (
        <section key={month} aria-labelledby={`month-${month}`} className="mt-14">
          <h2
            id={`month-${month}`}
            className="border-b border-gray-200 pb-3 text-xs font-semibold uppercase tracking-widest text-gray-500 dark:border-gray-800 dark:text-gray-400"
          >
            {monthFmt.format(new Date(month))}
          </h2>
          <ol className="mt-8 space-y-10">
            {monthDays.map((day) => (
              <ChangelogEntry key={day.date} day={day} />
            ))}
          </ol>
        </section>
      ))}

      <DownloadFooter href={`${REPO_URL}/releases`} label="All releases on GitHub" />
    </article>
  );
}
