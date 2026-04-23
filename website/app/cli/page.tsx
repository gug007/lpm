import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Monitor, Terminal } from "lucide-react";
import { Commands } from "@/components/home/commands";
import { CopyInstall } from "@/components/home/copy-install";
import { CLI_PATH, RELEASES_URL, releaseAsset } from "@/lib/links";

export const metadata: Metadata = {
  title: "lpm CLI — Manage projects from your terminal",
  description:
    "Fast, scriptable local project manager for your terminal. Same config and state as the desktop app.",
  alternates: {
    canonical: CLI_PATH,
  },
};

const CLI_DOWNLOADS = [
  {
    href: releaseAsset("lpm_darwin_arm64.tar.gz"),
    label: "CLI",
    sub: "macOS ARM64",
  },
  {
    href: releaseAsset("lpm_darwin_amd64.tar.gz"),
    label: "CLI",
    sub: "macOS Intel",
  },
];

export default function CliPage() {
  return (
    <>
      <section className="pt-28 sm:pt-40 pb-12 sm:pb-20 text-center">
        <div className="max-w-4xl mx-auto px-6">
          <p className="text-xs font-medium uppercase tracking-[0.25em] text-gray-400 dark:text-gray-500 mb-6">
            Command Line Interface
          </p>
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-[1.1] bg-gradient-to-br from-gray-900 via-gray-700 to-gray-500 dark:from-white dark:via-gray-200 dark:to-gray-500 bg-clip-text text-transparent">
            Fast, scriptable, all from your terminal
          </h1>
          <p className="mt-6 text-base sm:text-lg text-gray-400 dark:text-gray-500 max-w-lg mx-auto leading-relaxed tracking-wide">
            Manage local dev projects without leaving the command line. Same
            config, same state, same functionality as the desktop app.
          </p>

          <div className="mt-10 max-w-xl mx-auto">
            <div className="mb-2 flex justify-center items-center gap-1.5 text-[11px] font-medium text-gray-700 dark:text-gray-400">
              <Terminal className="w-3 h-3" />
              <span>Install via curl</span>
            </div>
            <CopyInstall />
          </div>

          <div className="mt-8">
            <Link
              href="/"
              className="text-[13px] text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors duration-200 inline-flex items-center gap-1.5"
            >
              <Monitor className="w-3.5 h-3.5" />
              Prefer the desktop app?
            </Link>
          </div>
        </div>
      </section>

      <Commands />

      <section className="py-20 sm:py-24 border-t border-gray-200 dark:border-gray-800 text-center">
        <div className="max-w-4xl mx-auto px-6">
          <div className="flex flex-col items-center gap-3 mb-12">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 tracking-wide uppercase">
              <Terminal className="w-3 h-3" />
              CLI Binaries
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Download the lpm CLI
            </h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              Prebuilt binaries for macOS (Apple Silicon &amp; Intel).
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl mx-auto">
            {CLI_DOWNLOADS.map(({ href, label, sub }) => (
              <a
                key={href}
                href={href}
                className="dl-card group relative flex flex-col items-center gap-2 px-6 py-6 rounded-2xl border border-gray-200 dark:border-gray-800 hover:shadow-lg hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-[#111]"
              >
                <div className="w-10 h-10 rounded-xl bg-gray-50 dark:bg-gray-800/60 flex items-center justify-center mb-1 group-hover:bg-gray-100 dark:group-hover:bg-gray-800 transition-colors">
                  <Terminal className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                </div>
                <span className="text-sm font-semibold">{label}</span>
                <span className="text-xs text-gray-400">{sub}</span>
              </a>
            ))}
          </div>
          <div className="mt-8">
            <a
              href={RELEASES_URL}
              className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              View all downloads
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
