import { GithubLink } from "@/components/github-link";
import { HeroDownload } from "@/components/home/hero-download";
import type { DownloadSource, GithubLinkSource } from "@/lib/analytics";
import type { DesktopOs } from "@/lib/downloads";

type Props = {
  os: DesktopOs;
  title: string;
  body: string;
  source: DownloadSource & GithubLinkSource;
};

export function OsCta({ os, title, body, source }: Props) {
  return (
    <section id="download" className="scroll-mt-20 py-20 text-center sm:py-24">
      <div className="mx-auto max-w-3xl px-6">
        <h2 className="text-balance bg-gradient-to-br from-gray-900 via-gray-800 to-gray-600 bg-clip-text text-3xl font-extrabold leading-[1.1] tracking-tight text-transparent sm:text-5xl dark:from-white dark:via-gray-100 dark:to-gray-400">
          {title}
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-pretty text-base leading-relaxed text-gray-600 sm:text-lg dark:text-gray-400">
          {body}
        </p>
        <div className="mt-10 flex justify-center">
          <HeroDownload source={source} focus={os} />
        </div>
        <div className="mt-8">
          <GithubLink
            source={source}
            className="inline-flex items-center gap-1.5 text-[13px] text-gray-500 transition-colors duration-200 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
          />
        </div>
      </div>
    </section>
  );
}
