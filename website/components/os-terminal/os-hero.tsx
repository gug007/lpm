import { GithubLink } from "@/components/github-link";
import { HeroDownload } from "@/components/home/hero-download";
import type { DownloadSource, GithubLinkSource } from "@/lib/analytics";
import type { DesktopOs } from "@/lib/downloads";

type Props = {
  os: DesktopOs;
  eyebrow: string;
  title: string;
  lede: string;
  source: DownloadSource & GithubLinkSource;
};

export function OsHero({ os, eyebrow, title, lede, source }: Props) {
  return (
    <section className="pt-[clamp(4.5rem,9.5vh,6.5rem)] pb-[clamp(1.25rem,3vh,2rem)] text-center">
      <div className="mx-auto max-w-4xl px-6">
        <p className="mb-5 text-xs font-medium uppercase tracking-[0.25em] text-gray-500 dark:text-gray-400">
          {eyebrow}
        </p>
        <h1 className="text-balance bg-gradient-to-br from-gray-900 via-gray-800 to-gray-600 bg-clip-text text-[2.25rem] font-extrabold leading-[1.06] tracking-tight text-transparent sm:text-5xl md:text-[clamp(2.75rem,6.2vh,3.75rem)] dark:from-white dark:via-gray-100 dark:to-gray-400">
          {title}
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-pretty text-base leading-relaxed text-gray-600 sm:text-[17px] dark:text-gray-400">
          {lede}
        </p>
        <div className="mt-[clamp(1.25rem,3vh,1.75rem)] flex justify-center">
          <HeroDownload source={source} focus={os} />
        </div>
        <div className="mt-[clamp(1rem,2vh,1.5rem)]">
          <GithubLink
            source={source}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition-colors duration-200 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
          />
        </div>
      </div>
    </section>
  );
}
