import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { HeroDownload } from "@/components/home/hero-download";
import { REPO_URL } from "@/lib/links";
import AppStoreButton from "./app-store-button";

export default function Cta() {
  return (
    <section className="py-20 sm:py-24 text-center">
      <div className="max-w-3xl mx-auto px-6">
        <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-[1.1] bg-gradient-to-br from-gray-900 via-gray-800 to-gray-600 dark:from-white dark:via-gray-100 dark:to-gray-400 bg-clip-text text-transparent">
          Put your terminals in your pocket.
          <br className="hidden sm:block" />
          Prompt your agents, review the diff, and ship it from anywhere.
        </h2>
        <p className="mt-6 text-base sm:text-lg text-gray-400 dark:text-gray-500 max-w-xl mx-auto leading-relaxed tracking-wide">
          Download the native macOS app, open a project, and pair your iPhone or
          iPad in Settings → Mobile devices. Free, native, and yours — the work
          stays on your Mac, the control comes with you.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row sm:items-start">
          <AppStoreButton />
          <div className="hidden sm:block">
            <HeroDownload />
          </div>
        </div>
        <Link
          href="/#download"
          className="mt-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white sm:hidden"
        >
          Get lpm for your Mac
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>

        <div className="mt-8">
          <a
            href={REPO_URL}
            className="text-[13px] text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors duration-200 inline-flex items-center gap-1.5"
          >
            View on GitHub
            <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </section>
  );
}
