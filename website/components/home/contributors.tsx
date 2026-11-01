import Image from "next/image";
import { Plus } from "lucide-react";
import { GithubLink } from "@/components/github-link";
import { SectionHeader } from "@/components/section-header";
import { fetchRecentFixes } from "@/lib/github-fixes";
import {
  fetchContributors,
  fetchLastCommit,
  getDownloadStats,
  type Contributor,
} from "@/lib/github-stats";
import { REPO_URL } from "@/lib/links";
import { RecentFixes } from "./recent-fixes";
import { RepoNumbers } from "./repo-numbers";

const CARD =
  "group flex items-center gap-3 rounded-2xl border pl-3 pr-5 py-3 transition-colors duration-200";

function avatarSrc(url: string, size: number): string {
  const u = new URL(url);
  u.searchParams.set("s", String(size * 2));
  return u.toString();
}

function commitsLabel(n: number): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? "commit" : "commits"}`;
}

function ContributorCard({ contributor }: { contributor: Contributor }) {
  return (
    <li>
      <a
        href={contributor.url}
        target="_blank"
        rel="noopener noreferrer"
        className={`${CARD} border-gray-200 dark:border-gray-800 bg-gray-50/40 dark:bg-white/[0.02] hover:border-gray-300 dark:hover:border-gray-700`}
      >
        <Image
          src={avatarSrc(contributor.avatarUrl, 40)}
          alt=""
          width={40}
          height={40}
          className="h-10 w-10 rounded-full ring-1 ring-gray-200 dark:ring-white/[0.08]"
        />
        <span className="flex flex-col leading-tight">
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 group-hover:underline underline-offset-4 decoration-gray-300 dark:decoration-gray-600">
            {contributor.login}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
            {commitsLabel(contributor.commits)}
          </span>
        </span>
      </a>
    </li>
  );
}

// The empty seat at the end of the row: open issues are where a first
// commit usually starts.
function NextContributorCard() {
  return (
    <li>
      <a
        href={`${REPO_URL}/issues`}
        target="_blank"
        rel="noopener noreferrer"
        className={`${CARD} border-dashed border-gray-300 hover:border-gray-400 dark:border-gray-700 dark:hover:border-gray-500`}
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full border border-dashed border-gray-300 text-gray-500 dark:border-gray-600 dark:text-gray-400">
          <Plus className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="flex flex-col leading-tight">
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            You?
          </span>
          <span className="text-xs text-gray-500 underline-offset-4 decoration-gray-300 group-hover:underline dark:text-gray-400 dark:decoration-gray-600">
            Pick an open issue
          </span>
        </span>
      </a>
    </li>
  );
}

export async function Contributors() {
  const [contributors, fixes, stats, lastCommit] = await Promise.all([
    fetchContributors(),
    fetchRecentFixes(),
    getDownloadStats().catch(() => null),
    fetchLastCommit(),
  ]);
  if (contributors.length === 0) return null;

  return (
    <section className="py-16 sm:py-20">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="Open source"
          title="Built in the open"
          description="lpm is free and open source. Thanks to everyone who has landed a commit."
          className="mb-10"
        />
        <RepoNumbers stats={stats} lastCommit={lastCommit} />
        <ul className="flex flex-wrap justify-center gap-3">
          {contributors.map((c) => (
            <ContributorCard key={c.login} contributor={c} />
          ))}
          <NextContributorCard />
        </ul>
        <RecentFixes fixes={fixes} />
        <div className="mt-8 text-center">
          <GithubLink
            source="home-contributors"
            className="text-[13px] text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors duration-200 inline-flex items-center gap-1.5"
          >
            Contribute on GitHub
          </GithubLink>
        </div>
      </div>
    </section>
  );
}
