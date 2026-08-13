import { HeroDownload } from "@/components/home/hero-download";

export function Cta() {
  return (
    <section className="py-20 sm:py-24 text-center">
      <div className="max-w-3xl mx-auto px-6">
        <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-[1.1] bg-gradient-to-br from-gray-900 via-gray-800 to-gray-600 dark:from-white dark:via-gray-100 dark:to-gray-400 bg-clip-text text-transparent">
          You&rsquo;ve seen what a config can do.
          <br className="hidden sm:block" />{" "}
          Let lpm write your first one.
        </h2>
        <p className="mt-6 text-base sm:text-lg text-gray-600 dark:text-gray-400 max-w-xl mx-auto leading-relaxed">
          Download lpm for macOS, point it at a project folder, and it writes
          the file for you — services detected, actions and terminals one click
          away.
        </p>

        <div className="mt-10 flex justify-center">
          <HeroDownload />
        </div>
      </div>
    </section>
  );
}
