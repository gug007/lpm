import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Code2,
  Eye,
  LockKeyhole,
  Save,
  SlidersHorizontal,
} from "lucide-react";
import { HeroDownload } from "@/components/home/hero-download";
import { RelatedPages } from "@/components/related-pages";
import { SectionHeader } from "@/components/section-header";
import {
  AI_AGENTS_PATH,
  CLAUDE_ACCOUNTS_PATH,
  CONNECT_AGENTS_PATH,
  FEATURES_PATH,
  SKILLS_PATH,
  STATUSLINE_PATH,
  TOKEN_USAGE_PATH,
} from "@/lib/links";
import {
  breadcrumbJsonLd,
  jsonLdString,
  webPageJsonLd,
} from "@/lib/structured-data";
import Cta from "./_components/cta";
import Faq from "./_components/faq";
import LpmStatuslineDemo from "./_components/lpm-statusline-demo";
import {
  BENEFITS,
  CLAUDE_ITEMS,
  CLAUDE_STATUSLINE_DOCS,
  CODEX_ITEMS,
  CODEX_STATUSLINE_DOCS,
  STEPS,
} from "./_components/statusline-copy";

// Every query this page ranks for on page one leads with "codex", so the title
// does too.
const TITLE = "Codex & Claude Code Statusline Editor for Mac";
const DESCRIPTION =
  "Build a custom Codex or Claude Code statusline in a visual editor: pick a preset, reorder fields, tune colors and meters, preview live. Free Mac app.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "Claude Code statusline",
    "Claude Code status line",
    "Codex statusline",
    "Codex status line",
    "Claude Code statusline GUI",
    "Codex statusline GUI",
    "customize Claude Code statusline",
    "Codex CLI status line",
    "macOS developer tools",
  ],
  alternates: {
    canonical: STATUSLINE_PATH,
  },
  openGraph: {
    title: TITLE,
    description:
      "Build a Codex or Claude Code statusline in a visual editor — presets, live preview, fields, colors, and usage meters. No config files.",
    type: "website",
    url: STATUSLINE_PATH,
    siteName: "lpm",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description:
      "Visual statusline editor for Codex and Claude Code, built into lpm for macOS.",
  },
};

const structuredData = [
  webPageJsonLd({
    title: TITLE,
    description: DESCRIPTION,
    path: STATUSLINE_PATH,
    about: [
      "Claude Code statusline",
      "Codex status line",
      "visual statusline editor",
      "macOS developer tools",
    ],
  }),
  breadcrumbJsonLd([
    { name: "Home", path: "/" },
    {
      name: "Claude Code & Codex Statusline",
      path: STATUSLINE_PATH,
    },
  ]),
];

export default function ClaudeCodeCodexStatuslinePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(structuredData) }}
      />

      <section className="relative overflow-hidden pt-[clamp(4.5rem,9.5vh,6.5rem)] pb-[clamp(1.25rem,3vh,2rem)] text-center">
        <div className="absolute inset-x-0 top-0 -z-10 h-[50rem] bg-[radial-gradient(circle_at_20%_14%,rgba(217,119,87,0.17),transparent_28%),radial-gradient(circle_at_80%_12%,rgba(16,163,127,0.16),transparent_27%)] dark:bg-[radial-gradient(circle_at_20%_14%,rgba(217,119,87,0.22),transparent_28%),radial-gradient(circle_at_80%_12%,rgba(16,163,127,0.2),transparent_27%)]" />
        <div className="mx-auto max-w-6xl px-6">
          <p className="mb-5 text-xs font-medium uppercase tracking-[0.25em] text-gray-500 dark:text-gray-400">
            Built into lpm · macOS
          </p>
          <h1 className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-600 bg-clip-text text-[2.25rem] font-extrabold leading-[1.06] tracking-[-0.04em] text-transparent dark:from-white dark:via-gray-100 dark:to-gray-400 sm:text-5xl md:text-[clamp(2.75rem,6.2vh,3.75rem)]">
            Customize Claude Code & Codex statuslines without editing config
            files.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-gray-600 dark:text-gray-400 sm:text-[17px]">
            lpm gives Claude Code and Codex a visual statusline editor. Pick a
            layout, arrange useful signals, tune the appearance, and watch every
            change in a live preview as lpm saves it.
          </p>
          <div className="mt-[clamp(1rem,2vh,1.5rem)] flex flex-wrap items-center justify-center gap-x-5 gap-y-3 text-xs text-gray-500 dark:text-gray-400">
            <span className="inline-flex items-center gap-2">
              <Eye className="h-3.5 w-3.5" aria-hidden />
              Live preview
            </span>
            <span className="inline-flex items-center gap-2">
              <Save className="h-3.5 w-3.5" aria-hidden />
              Automatic local save
            </span>
            <span className="inline-flex items-center gap-2">
              <LockKeyhole className="h-3.5 w-3.5" aria-hidden />
              Native and private
            </span>
          </div>
          <div className="mt-[clamp(1.25rem,3vh,1.75rem)] flex flex-col items-center gap-3">
            <HeroDownload source="statusline-hero" />
            <a
              href="#preview"
              className="inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold text-gray-600 transition hover:text-gray-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 dark:text-gray-400 dark:hover:text-white dark:focus-visible:ring-white"
            >
              Try the interactive preview
              <ArrowRight className="h-4 w-4" aria-hidden />
            </a>
          </div>
        </div>
      </section>

      <LpmStatuslineDemo />

      <section className="border-y border-gray-100 bg-gray-50/70 py-20 dark:border-gray-800/70 dark:bg-white/[0.015] sm:py-24">
        <div className="mx-auto max-w-5xl px-6">
          <SectionHeader
            eyebrow="One lpm setting, two agent formats"
            title="lpm handles what each statusline supports"
            description="Claude Code and Codex expose different customization systems. lpm gives each one a focused editor while keeping the workflow consistent."
          />

          <div className="grid gap-5 md:grid-cols-2">
            <article className="rounded-3xl border border-[#D97757]/25 bg-white p-6 shadow-sm dark:bg-[#151515] sm:p-8">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#D97757]/12 text-[#D97757]">
                    <Code2 className="h-5 w-5" aria-hidden />
                  </span>
                  <h3 className="text-xl font-bold text-gray-950 dark:text-white">
                    Claude Code
                  </h3>
                </div>
                <span className="rounded-full bg-[#D97757]/10 px-2.5 py-1 text-[11px] font-semibold text-[#B75F40] dark:text-[#F09978]">
                  Fully styled
                </span>
              </div>
              <p className="mt-5 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                lpm builds and applies Claude Code’s command-powered statusline
                through a visual editor.
              </p>
              <ul className="mt-6 space-y-3 text-sm text-gray-700 dark:text-gray-300">
                {CLAUDE_ITEMS.map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <Check
                      className="mt-0.5 h-4 w-4 shrink-0 text-[#D97757]"
                      aria-hidden
                    />
                    {item}
                  </li>
                ))}
              </ul>
              <a
                href={CLAUDE_STATUSLINE_DOCS}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-7 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-gray-800 transition hover:text-[#B75F40] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 dark:text-gray-200 dark:hover:text-[#F09978] dark:focus-visible:ring-white"
              >
                Claude Code statusline docs
                <ArrowRight className="h-4 w-4" aria-hidden />
              </a>
            </article>

            <article className="rounded-3xl border border-[#10A37F]/25 bg-white p-6 shadow-sm dark:bg-[#151515] sm:p-8">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#10A37F]/12 text-[#10A37F]">
                    <SlidersHorizontal className="h-5 w-5" aria-hidden />
                  </span>
                  <h3 className="text-xl font-bold text-gray-950 dark:text-white">
                    Codex
                  </h3>
                </div>
                <span className="rounded-full bg-[#10A37F]/10 px-2.5 py-1 text-[11px] font-semibold text-[#087A5E] dark:text-[#4FD1AB]">
                  Native fields
                </span>
              </div>
              <p className="mt-5 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                lpm turns Codex’s native statusline fields into a visual,
                reorderable list and saves it to the local configuration.
              </p>
              <ul className="mt-6 space-y-3 text-sm text-gray-700 dark:text-gray-300">
                {CODEX_ITEMS.map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <Check
                      className="mt-0.5 h-4 w-4 shrink-0 text-[#10A37F]"
                      aria-hidden
                    />
                    {item}
                  </li>
                ))}
              </ul>
              <a
                href={CODEX_STATUSLINE_DOCS}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-7 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-gray-800 transition hover:text-[#087A5E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 dark:text-gray-200 dark:hover:text-[#4FD1AB] dark:focus-visible:ring-white"
              >
                Codex status line config
                <ArrowRight className="h-4 w-4" aria-hidden />
              </a>
            </article>
          </div>
          <p className="mx-auto mt-8 max-w-2xl text-center text-sm leading-relaxed text-gray-600 dark:text-gray-400">
            The 5-hour and weekly usage items show the same plan windows lpm
            tracks on its{" "}
            <Link
              href={TOKEN_USAGE_PATH}
              className="font-medium text-gray-900 underline decoration-gray-300 underline-offset-4 hover:decoration-gray-900 dark:text-gray-100 dark:decoration-gray-700 dark:hover:decoration-gray-100"
            >
              Usage page and sidebar meter
            </Link>
            , for Pro and Max logins.
          </p>
        </div>
      </section>

      <section className="py-20 sm:py-24">
        <div className="mx-auto max-w-5xl px-6">
          <SectionHeader
            eyebrow="Made for daily agent work"
            title="Your statusline should reduce uncertainty"
          />
          <div className="grid gap-5 md:grid-cols-3">
            {BENEFITS.map(({ icon: Icon, title, copy }) => (
              <article
                key={title}
                className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-[#151515]"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-gray-700 dark:bg-white/[0.06] dark:text-gray-300">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <h3 className="mt-5 text-lg font-bold text-gray-950 dark:text-white">
                  {title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                  {copy}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-gray-100 bg-gray-50/70 py-20 dark:border-gray-800/70 dark:bg-white/[0.015] sm:py-24">
        <div className="mx-auto max-w-5xl px-6">
          <SectionHeader
            eyebrow="Three steps in lpm"
            title="From default to useful in a minute"
          />
          <div className="grid gap-5 md:grid-cols-3">
            {STEPS.map(({ step, icon: Icon, title, copy }) => (
              <article
                key={step}
                className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-[#151515]"
              >
                <span className="absolute top-4 right-5 font-mono text-4xl font-bold text-gray-100 dark:text-white/[0.035]">
                  {step}
                </span>
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-gray-700 dark:bg-white/[0.06] dark:text-gray-300">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <h3 className="mt-5 text-lg font-bold text-gray-950 dark:text-white">
                  {title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                  {copy}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <Faq />

      <RelatedPages
        links={[
          {
            href: TOKEN_USAGE_PATH,
            title: "Claude Code & Codex usage and limits",
            description:
              "The 5-hour and weekly meters your statusline shows, plus tokens and estimated cost per project.",
          },
          {
            href: SKILLS_PATH,
            title: "Create & edit Claude Code and Codex skills",
            description:
              "Describe a task, let AI draft the SKILL.md, and see what every skill costs in context.",
          },
          {
            href: CLAUDE_ACCOUNTS_PATH,
            title: "Multiple Claude Code accounts",
            description:
              "Keep a work and a personal Claude login signed in, one per project.",
          },
          {
            href: AI_AGENTS_PATH,
            title: "Best terminal for Claude Code & Codex",
            description:
              "Every Claude Code and Codex session beside its project, services and terminals.",
          },
          {
            href: CONNECT_AGENTS_PATH,
            title: "Connect agents to your dev environment",
            description:
              "Let an agent start services, tail their logs and make project copies through the lpm CLI.",
          },
          {
            href: FEATURES_PATH,
            title: "Everything lpm does",
            description:
              "The full feature list, statusline editor included.",
          },
        ]}
      />

      <Cta />
    </>
  );
}
