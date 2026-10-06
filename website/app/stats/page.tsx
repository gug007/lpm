import type { Metadata } from "next";
import { DOWNLOAD_ENTRIES, DOWNLOADS_BY_OS } from "@/lib/downloads";
import { getDownloadStats, type ReleaseStat } from "@/lib/github-stats";
import { REPO_URL, STATS_PATH } from "@/lib/links";
import { breadcrumbJsonLd, jsonLdString, webPageJsonLd } from "@/lib/structured-data";
import { ReleaseList } from "./_components/release-list";
import { StatCard } from "./_components/stat-card";
import { StatsFooter } from "./_components/stats-footer";
import { StatsHeader, STATS_LINK } from "./_components/stats-header";

export const revalidate = 3600;

const TITLE = "Download Stats by Release";
const DESCRIPTION =
  "Live download counts for lpm across all GitHub releases, refreshed hourly — see how many times each version of the free desktop app has been downloaded.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: {
    canonical: STATS_PATH,
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    url: STATS_PATH,
    siteName: "lpm",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

const structuredData = [
  webPageJsonLd({
    title: TITLE,
    description: DESCRIPTION,
    path: STATS_PATH,
  }),
  breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Download stats", path: STATS_PATH },
  ]),
];

function downloadsByAsset(releases: ReleaseStat[], ...names: string[]): number {
  return releases.reduce(
    (sum, r) =>
      sum +
      r.assets
        .filter((a) => names.includes(a.name))
        .reduce((s, a) => s + a.downloads, 0),
    0,
  );
}

type PlatformCard = { label: string; value: number; note: string };

// The Windows and Linux files only exist on newer releases, so their cards
// appear once they have been downloaded at all.
function platformCards(releases: ReleaseStat[]): PlatformCard[] {
  const count = (...names: string[]) => downloadsByAsset(releases, ...names);
  const cards: PlatformCard[] = [
    {
      label: "Apple Silicon",
      value: count(DOWNLOAD_ENTRIES["mac-arm"].filename),
      note: "M-series Macs",
    },
    {
      label: "Intel",
      value: count(DOWNLOAD_ENTRIES["mac-intel"].filename),
      note: "x86-64 Macs",
    },
  ];
  const windows = count(DOWNLOAD_ENTRIES["windows-x64"].filename);
  if (windows > 0) {
    cards.push({ label: "Windows", value: windows, note: "x64 installer" });
  }
  const linux = count(...DOWNLOADS_BY_OS.linux.map(({ filename }) => filename));
  if (linux > 0) {
    cards.push({ label: "Linux", value: linux, note: ".deb, .rpm and AppImage" });
  }
  return cards;
}

export default async function StatsPage() {
  const stats = await getDownloadStats();
  const cards = stats ? platformCards(stats.releases) : [];
  const cardGrid = cards.length > 2 ? "sm:grid-cols-4" : "sm:grid-cols-3";
  const totalSpan =
    cards.length > 3 ? "col-span-2 sm:col-span-4" : "col-span-2 sm:col-span-1";

  return (
    <article className="max-w-3xl mx-auto px-6 pt-28 pb-16 sm:pt-32 sm:pb-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(structuredData) }}
      />
      <StatsHeader />

      {stats ? (
        <>
          <section className={`mt-10 grid grid-cols-2 gap-3 ${cardGrid}`}>
            <StatCard
              label="Total desktop downloads"
              value={stats.total}
              note={`Across ${stats.releases.length} releases`}
              emphasis
              className={totalSpan}
            />
            {cards.map((card) => (
              <StatCard key={card.label} {...card} />
            ))}
          </section>

          <section className="mt-12">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              By release
            </h2>
            {stats.releases.length === 0 ? (
              <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
                No releases yet.
              </p>
            ) : (
              <ReleaseList releases={stats.releases} />
            )}
          </section>
        </>
      ) : (
        <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">
          Couldn&rsquo;t load download data from GitHub right now. Try again in a
          moment, or view releases directly at{" "}
          <a href={`${REPO_URL}/releases`} className={STATS_LINK}>
            github.com/gug007/lpm/releases
          </a>
          .
        </p>
      )}

      <StatsFooter />
    </article>
  );
}
