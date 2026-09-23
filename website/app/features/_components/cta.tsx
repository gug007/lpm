import { GithubLink } from "@/components/github-link";
import { HeroDownload } from "@/components/home/hero-download";

export default function Cta() {
  return (
    <section id="download" className="scroll-mt-20 py-20 text-center sm:py-24">
      <div className="mx-auto max-w-3xl px-6">
        <h2 className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-600 bg-clip-text text-3xl font-extrabold leading-[1.1] tracking-tight text-transparent sm:text-5xl dark:from-white dark:via-gray-100 dark:to-gray-400">
          Try all of it on a project
          <br className="hidden sm:block" />{" "}
          you already have.
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-gray-600 sm:text-lg dark:text-gray-400">
          Download lpm, add a folder, and press Start. Every feature on this
          page is free, with no account and no paid tier.
        </p>
        <div className="mt-10 flex justify-center">
          <HeroDownload source="features-cta" />
        </div>
        <div className="mt-8">
          <GithubLink
            source="features-cta"
            className="inline-flex min-h-11 items-center gap-1.5 px-3 text-[13px] text-gray-500 transition-colors duration-200 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
          >
            View the source on GitHub
          </GithubLink>
        </div>
      </div>
    </section>
  );
}
