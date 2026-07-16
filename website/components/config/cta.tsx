import { HeroDownload } from "@/components/home/hero-download";

export function Cta() {
  return (
    <section className="py-16 sm:py-20 text-center">
      <div className="max-w-3xl mx-auto px-6">
        <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight leading-[1.1] bg-gradient-to-br from-gray-900 via-gray-800 to-gray-600 dark:from-white dark:via-gray-100 dark:to-gray-400 bg-clip-text text-transparent">
          You&rsquo;ve seen everything a config can do — let lpm write your
          first one for you.
        </h2>
        <div className="mt-10 flex justify-center">
          <HeroDownload />
        </div>
      </div>
    </section>
  );
}
