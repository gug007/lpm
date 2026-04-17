import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Cta } from "@/components/vs/cta";
import { SectionHeader } from "@/components/section-header";
import { VS_BASE_PATH, vsPath, type VsSlug } from "@/lib/links";

export const metadata: Metadata = {
  title: "How lpm compares",
  description:
    "Side-by-side comparisons of lpm against Foreman, Overmind, Docker Compose, tmux, and PM2 — honest, per-workflow, no marketing fluff.",
  keywords: [
    "lpm alternatives",
    "foreman alternative",
    "overmind alternative",
    "docker compose alternative for dev",
    "tmux alternative",
    "pm2 alternative dev",
    "dev process manager comparison",
    "local project manager",
  ],
  alternates: { canonical: VS_BASE_PATH },
  openGraph: {
    title: "How lpm compares",
    description:
      "Side-by-side comparisons of lpm against Foreman, Overmind, Docker Compose, tmux, and PM2.",
    type: "website",
    url: VS_BASE_PATH,
    siteName: "lpm",
  },
  twitter: {
    card: "summary_large_image",
    title: "How lpm compares",
    description:
      "Honest side-by-side comparisons of lpm against Foreman, Overmind, Docker Compose, tmux, and PM2.",
  },
};

type Entry = {
  slug: VsSlug;
  name: string;
  tagline: string;
};

const ENTRIES: Entry[] = [
  {
    slug: "foreman",
    name: "Foreman",
    tagline:
      "The Procfile classic for Rails. lpm adds per-service panes, a desktop app, and multi-project switching.",
  },
  {
    slug: "overmind",
    name: "Overmind",
    tagline:
      "Tmux-based Procfile runner. lpm gives the same per-process control — without needing tmux.",
  },
  {
    slug: "docker-compose",
    name: "Docker Compose",
    tagline:
      "Containers for local dev. lpm runs your stack natively, or drives compose when you need it.",
  },
  {
    slug: "tmux",
    name: "tmux",
    tagline:
      "Hand-rolled panes and .tmux.conf. lpm is one-command start, same visibility, no config.",
  },
  {
    slug: "pm2",
    name: "PM2",
    tagline:
      "Production Node daemon. lpm is built for the dev loop — the two are complementary.",
  },
];

export default function ComparisonsHubPage() {
  return (
    <>
      <section className="pt-28 sm:pt-40 pb-12 sm:pb-16 text-center">
        <div className="max-w-3xl mx-auto px-6">
          <p className="text-xs font-medium uppercase tracking-[0.25em] text-gray-400 dark:text-gray-500 mb-6">
            Comparisons
          </p>
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-[1.1] bg-gradient-to-br from-gray-900 via-gray-700 to-gray-500 dark:from-white dark:via-gray-200 dark:to-gray-500 bg-clip-text text-transparent">
            How lpm compares
          </h1>
          <p className="mt-6 text-base sm:text-lg text-gray-400 dark:text-gray-500 max-w-xl mx-auto leading-relaxed tracking-wide">
            Honest, per-workflow comparisons — not vague superiority claims.
            Pick the page that matches the tool you already use.
          </p>
        </div>
      </section>

      <section className="pb-12 sm:pb-16">
        <div className="max-w-3xl mx-auto px-6">
          <ul className="grid sm:grid-cols-2 gap-3">
            {ENTRIES.map((entry) => (
              <li key={entry.slug}>
                <Link
                  href={vsPath(entry.slug)}
                  className="group block h-full rounded-2xl border border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition-colors duration-200 p-6"
                >
                  <div className="flex items-baseline justify-between gap-4 mb-2">
                    <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                      lpm vs {entry.name}
                    </h2>
                    <ArrowRight className="w-3.5 h-3.5 shrink-0 text-gray-300 dark:text-gray-600 group-hover:text-gray-900 dark:group-hover:text-white group-hover:translate-x-0.5 transition-all duration-200" />
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                    {entry.tagline}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="py-16 sm:py-20">
        <div className="max-w-3xl mx-auto px-6">
          <SectionHeader
            eyebrow="How we write these"
            title="Written for the people who already use the other tool"
            description="Each page acknowledges where the alternative wins, where lpm wins, and where they can coexist. If we can't name a workflow difference, we don't pretend there is one."
          />
        </div>
      </section>

      <Cta
        title={
          <>
            Try lpm on your next project.
            <br className="hidden sm:block" />
            Keep the tool you love for the rest.
          </>
        }
        description="Free, open source, native macOS app plus CLI. No lock-in — lpm starts and stops native processes the same way you would."
      />
    </>
  );
}
