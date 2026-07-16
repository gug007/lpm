import { HeroDownload } from "./hero-download";

export function CtaBand() {
  return (
    <section className="py-16 sm:py-20 border-t border-gray-200 dark:border-gray-800 text-center">
      <div className="max-w-xl mx-auto px-6 flex flex-col items-center gap-8">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
          Liked the demo? Run the real thing.
        </h2>
        <HeroDownload />
      </div>
    </section>
  );
}
