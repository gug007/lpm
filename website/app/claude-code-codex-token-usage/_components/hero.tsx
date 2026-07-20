import { BarChart3, ChevronDown, ShieldCheck } from "lucide-react";
import { HeroDownload } from "@/components/home/hero-download";

export default function Hero() {
  return (
    <section className="relative overflow-hidden pt-28 pb-12 text-center sm:pt-40 sm:pb-16">
      <div className="absolute inset-x-0 top-0 -z-10 h-[42rem] bg-[radial-gradient(circle_at_24%_10%,rgba(217,119,87,0.16),transparent_32%),radial-gradient(circle_at_76%_8%,rgba(16,163,127,0.13),transparent_30%)] dark:bg-[radial-gradient(circle_at_24%_10%,rgba(217,119,87,0.2),transparent_32%),radial-gradient(circle_at_76%_8%,rgba(16,163,127,0.17),transparent_30%)]" />
      <div className="mx-auto max-w-4xl px-6">
        <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white/70 px-3 py-1.5 text-xs font-medium text-gray-600 shadow-sm backdrop-blur dark:border-gray-800 dark:bg-white/[0.04] dark:text-gray-300">
          <BarChart3 className="h-3.5 w-3.5" aria-hidden />
          Local AI usage analytics
        </p>
        <h1 className="bg-gradient-to-br from-gray-950 via-gray-800 to-gray-600 bg-clip-text text-4xl font-extrabold leading-[1.05] tracking-tight text-transparent dark:from-white dark:via-gray-100 dark:to-gray-400 sm:text-6xl">
          Track Claude Code and Codex token usage by project.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed tracking-wide text-gray-600 dark:text-gray-400 sm:text-lg">
          See tokens, approximate cost, cache efficiency, models, projects, and
          daily activity in one native Mac dashboard. Usage metadata stays on
          this Mac; prompts and responses are not included.
        </p>

        <div className="mt-10 flex justify-center">
          <HeroDownload />
        </div>

        <a
          href="#dashboard"
          className="mt-7 inline-flex min-h-11 items-center gap-1.5 px-3 text-sm font-medium text-gray-500 transition-colors duration-200 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 dark:text-gray-400 dark:hover:text-white dark:focus-visible:ring-white"
        >
          Explore the dashboard
          <ChevronDown className="h-4 w-4" aria-hidden />
        </a>

        <div className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-gray-500 dark:text-gray-400">
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#D97757]" aria-hidden />
            Claude Code
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#10A37F]" aria-hidden />
            Codex
          </span>
          <span className="inline-flex items-center gap-2">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
            Local metadata only
          </span>
        </div>
      </div>
    </section>
  );
}
