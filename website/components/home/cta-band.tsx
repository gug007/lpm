import { GithubLink } from "@/components/github-link";
import { HeroDownload } from "./hero-download";

export function CtaBand() {
  return (
    <section className="py-16 sm:py-20 text-center">
      <div className="max-w-3xl mx-auto px-6">
        <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-[1.1] bg-gradient-to-br from-gray-900 via-gray-800 to-gray-600 dark:from-white dark:via-gray-100 dark:to-gray-400 bg-clip-text text-transparent">
          You just watched it work.
          <br className="hidden sm:block" />{" "}
          Now run it on your own projects.
        </h2>
        <p className="mt-6 text-base sm:text-lg text-gray-600 dark:text-gray-400 max-w-xl mx-auto leading-relaxed">
          Free and open source, with native builds for Apple Silicon and Intel
          Macs. No account, no paid tier — point it at a folder you already
          have.
        </p>

        <div className="mt-10 flex justify-center">
          <HeroDownload />
        </div>

        <div className="mt-8">
          <GithubLink
            source="home-cta"
            className="text-[13px] text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors duration-200 inline-flex items-center gap-1.5"
          />
        </div>
      </div>
    </section>
  );
}
