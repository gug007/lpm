import type { Metadata } from "next";
import Link from "next/link";
import { getDownloadStats } from "@/lib/github-stats";
import { RELEASES_URL, REPO_URL, STATS_PATH } from "@/lib/links";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Download stats",
  description:
    "Live download counts for lpm across all GitHub releases — desktop app and CLI.",
  alternates: {
    canonical: STATS_PATH,
  },
};

const numberFmt = new Intl.NumberFormat("en-US");
const dateFmt = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

export default async function StatsPage() {
  const stats = await getDownloadStats();

  if (!stats) {
    return (
      <article className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
          Download stats
        </h1>
        <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">
          Couldn&rsquo;t load download data from GitHub right now. Try again in a
          moment, or view releases directly at{" "}
          <a
            href={RELEASES_URL}
            className="underline hover:text-gray-900 dark:hover:text-gray-100"
          >
            github.com/gug007/lpm/releases
          </a>
          .
        </p>
      </article>
    );
  }

  const { total, releases } = stats;

  return (
    <article className="max-w-3xl mx-auto px-6 py-16">
      <header>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
          Download stats
        </h1>
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
          Aggregated from{" "}
          <a
            href={`${REPO_URL}/releases`}
            className="underline hover:text-gray-900 dark:hover:text-gray-100"
          >
            GitHub Releases
          </a>
          . Updated hourly.
        </p>
      </header>

      <section className="mt-10">
        <StatCard label="Total desktop downloads" value={total} emphasis />
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          By release
        </h2>
        {releases.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
            No releases yet.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-gray-100 dark:divide-gray-800/60 border border-gray-100 dark:border-gray-800/60 rounded-2xl overflow-hidden">
            {releases.map((r) => (
              <li key={r.tag} className="px-5 py-4">
                <div className="flex items-baseline justify-between gap-4">
                  <div>
                    <a
                      href={r.url}
                      className="text-sm font-semibold text-gray-900 dark:text-gray-100 hover:underline"
                    >
                      {r.tag}
                    </a>
                    {r.publishedAt && (
                      <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
                        {dateFmt.format(new Date(r.publishedAt))}
                      </span>
                    )}
                  </div>
                  <span className="text-sm tabular-nums text-gray-700 dark:text-gray-300">
                    {numberFmt.format(r.total)}
                  </span>
                </div>
                {r.assets.length > 0 && (
                  <ul className="mt-3 space-y-1 text-xs text-gray-500 dark:text-gray-400">
                    {r.assets.map((a) => (
                      <li
                        key={a.name}
                        className="flex items-center justify-between gap-4"
                      >
                        <span className="truncate">{a.label}</span>
                        <span className="tabular-nums">
                          {numberFmt.format(a.downloads)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-12 text-xs text-gray-400 dark:text-gray-500">
        <Link
          href="/"
          className="underline hover:text-gray-700 dark:hover:text-gray-300"
        >
          ← Back to home
        </Link>
      </div>
    </article>
  );
}

function StatCard({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: number;
  emphasis?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 px-5 py-6 bg-white dark:bg-[#111]">
      <div className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500">
        {label}
      </div>
      <div
        className={`mt-2 tabular-nums font-bold tracking-tight ${
          emphasis
            ? "text-3xl sm:text-4xl text-gray-900 dark:text-white"
            : "text-2xl text-gray-700 dark:text-gray-200"
        }`}
      >
        {numberFmt.format(value)}
      </div>
    </div>
  );
}
