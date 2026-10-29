import { HeroDownload } from "@/components/home/hero-download";

export default function Cta() {
  return (
    <section id="download" className="py-20 text-center sm:py-24">
      <div className="mx-auto max-w-3xl px-6">
        <h2 className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-600 bg-clip-text text-3xl font-extrabold leading-[1.1] tracking-tight text-transparent dark:from-white dark:via-gray-100 dark:to-gray-400 sm:text-5xl">
          Know your pace without doing the math.
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed tracking-wide text-gray-500 dark:text-gray-400 sm:text-lg">
          lpm is free and open source. It reads your 5-hour and weekly limits
          from Claude Code and Codex and keeps the pace in view while your
          agents work.
        </p>
        <div className="mt-10 flex justify-center">
          <HeroDownload source="limit-calculator-cta" />
        </div>
      </div>
    </section>
  );
}
