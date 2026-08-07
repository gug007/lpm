import { ArrowDown } from "lucide-react";
import { HeroDownload } from "@/components/home/hero-download";

export default function Hero() {
  return (
    <section className="relative overflow-hidden pt-28 pb-10 sm:pt-40 sm:pb-14">
      <div className="absolute inset-x-0 top-0 -z-10 h-[40rem] bg-[radial-gradient(circle_at_18%_12%,rgba(74,222,128,0.10),transparent_38%),radial-gradient(circle_at_82%_8%,rgba(99,102,241,0.10),transparent_36%)] dark:bg-[radial-gradient(circle_at_18%_12%,rgba(74,222,128,0.13),transparent_36%),radial-gradient(circle_at_82%_8%,rgba(99,102,241,0.14),transparent_34%)]" />
      <div className="mx-auto max-w-4xl px-6 text-center">
        <p className="mb-6 text-xs font-medium tracking-[0.25em] text-gray-500 uppercase dark:text-gray-400">
          Project sidebar · macOS
        </p>
        <h1 className="bg-gradient-to-br from-gray-950 via-gray-800 to-gray-600 bg-clip-text text-4xl leading-[1.05] font-extrabold tracking-tight text-transparent sm:text-6xl dark:from-white dark:via-gray-100 dark:to-gray-400">
          A Mac terminal with a project sidebar — not another row of tabs.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed tracking-wide text-gray-600 sm:text-lg dark:text-gray-400">
          lpm gives every project you work on one persistent row in a sidebar.
          Its terminals, whether anything is running, and whether an agent is
          waiting on you all live under that row. Click a project and its
          workspace comes back — the terminals you left keep running and keep
          their scrollback.
        </p>

        <div className="mt-10 flex justify-center">
          <HeroDownload source="project-sidebar-hero" />
        </div>

        <a
          href="#walkthrough"
          className="mt-7 inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-gray-500 transition-colors hover:text-gray-900 focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:outline-none dark:text-gray-400 dark:hover:text-white dark:focus-visible:ring-white"
        >
          Try the interactive walkthrough
          <ArrowDown className="h-3.5 w-3.5" aria-hidden />
        </a>

        <p className="mt-6 text-xs text-gray-500 dark:text-gray-400">
          Free and open source · Native macOS build for Apple Silicon and Intel
        </p>
      </div>
    </section>
  );
}
