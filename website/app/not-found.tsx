import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { HeroDownload } from "@/components/home/hero-download";
import {
  AI_AGENTS_PATH,
  CONFIG_PATH,
  FEATURES_PATH,
  MOBILE_PATH,
} from "@/lib/links";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: true },
};

const LINKS = [
  { href: "/", label: "Home" },
  { href: FEATURES_PATH, label: "Everything lpm does" },
  { href: AI_AGENTS_PATH, label: "lpm for Claude Code & Codex" },
  { href: CONFIG_PATH, label: "Docs and config reference" },
  { href: MOBILE_PATH, label: "The iPhone companion" },
];

export default function NotFound() {
  return (
    <section className="pt-[clamp(6rem,14vh,9rem)] pb-20 text-center sm:pb-24">
      <div className="mx-auto max-w-2xl px-6">
        <p className="mb-5 text-xs font-medium uppercase tracking-[0.25em] text-gray-500 dark:text-gray-400">
          404
        </p>
        <h1 className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-600 bg-clip-text text-4xl font-extrabold leading-[1.1] tracking-tight text-transparent sm:text-5xl dark:from-white dark:via-gray-100 dark:to-gray-400">
          This page isn&apos;t here.
        </h1>
        <p className="mx-auto mt-5 max-w-lg text-base leading-relaxed text-gray-600 dark:text-gray-400">
          The link may be old, or the page may have moved. These are the
          places most people are looking for.
        </p>
        <ul className="mx-auto mt-8 grid max-w-md gap-2 text-left">
          {LINKS.map(({ href, label }) => (
            <li key={href}>
              <Link
                href={href}
                className="flex min-h-11 items-center justify-between rounded-xl border border-gray-200 px-4 text-sm font-medium text-gray-900 transition-colors duration-200 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-100 dark:hover:border-gray-700 dark:hover:bg-white/[0.03]"
              >
                {label}
                <ArrowRight className="h-4 w-4 text-gray-400" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-12 flex justify-center">
          <HeroDownload source="not-found" />
        </div>
      </div>
    </section>
  );
}
