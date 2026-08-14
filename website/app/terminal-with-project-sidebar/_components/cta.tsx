import { GithubLink } from "@/components/github-link";
import { HeroDownload } from "@/components/home/hero-download";

export default function Cta() {
  return (
    <section className="py-20 text-center sm:py-24">
      <div className="mx-auto max-w-3xl px-6">
        <h2 className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-600 bg-clip-text text-3xl leading-[1.1] font-extrabold tracking-tight text-transparent sm:text-5xl dark:from-white dark:via-gray-100 dark:to-gray-400">
          Give every project a home.
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed tracking-wide text-gray-500 sm:text-lg dark:text-gray-400">
          Point lpm at the folders you already work in, drag them into the order
          that matches your week, and let each one hold its own terminals. Free
          and open source, on Apple Silicon and Intel Macs.
        </p>

        <div className="mt-10 flex justify-center">
          <HeroDownload source="project-sidebar-cta" />
        </div>

        <div className="mt-8">
          <GithubLink
            source="project-sidebar-cta"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-[13px] text-gray-500 transition-colors duration-200 hover:text-gray-900 focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:outline-none dark:text-gray-400 dark:hover:text-white dark:focus-visible:ring-white"
          />
        </div>
      </div>
    </section>
  );
}
