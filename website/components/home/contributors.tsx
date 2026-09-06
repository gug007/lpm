import Image from "next/image";
import { GithubLink } from "@/components/github-link";
import { SectionHeader } from "@/components/section-header";
import { fetchContributors, type Contributor } from "@/lib/github-stats";

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
        className="group flex items-center gap-3 rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50/40 dark:bg-white/[0.02] pl-3 pr-5 py-3 hover:border-gray-300 dark:hover:border-gray-700 transition-colors duration-200"
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

export async function Contributors() {
  const contributors = await fetchContributors();
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
        <ul className="flex flex-wrap justify-center gap-3">
          {contributors.map((c) => (
            <ContributorCard key={c.login} contributor={c} />
          ))}
        </ul>
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
