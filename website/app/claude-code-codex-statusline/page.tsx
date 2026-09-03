import type { Metadata } from "next";
import {
  ArrowRight,
  Check,
  Code2,
  Eye,
  FileSliders,
  LockKeyhole,
  Monitor,
  Save,
  Settings2,
  SlidersHorizontal,
} from "lucide-react";
import { HeroDownload } from "@/components/home/hero-download";
import { RelatedPages } from "@/components/related-pages";
import { SectionHeader } from "@/components/section-header";
import {
  AI_AGENTS_PATH,
  CONNECT_AGENTS_PATH,
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

// Every query this page ranks for on page one leads with "codex", so the title
// does too.
const TITLE = "Codex & Claude Code Statusline — Customize It Without Config Files";
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
      name: "lpm statusline customization",
      path: STATUSLINE_PATH,
    },
  ]),
];

const benefits = [
  {
    icon: SlidersHorizontal,
    title: "Visual instead of fragile",
    copy: "Choose from real fields, valid colors, separators, and meter styles. lpm keeps the underlying agent configuration out of your way.",
  },
  {
    icon: Eye,
    title: "Preview the real signal",
    copy: "See representative values using your lpm terminal theme and font size before the line reaches Claude Code or Codex.",
  },
  {
    icon: Save,
    title: "Saved while you work",
    copy: "Preset changes and custom edits apply automatically, so you can iterate without copying snippets between files.",
  },
];

const steps = [
  {
    step: "01",
    icon: Settings2,
    title: "Open AI & Integrations",
    copy: "In lpm, click Settings at the bottom of the sidebar and select AI & Integrations.",
  },
  {
    step: "02",
    icon: FileSliders,
    title: "Choose the statusline",
    copy: "Click Customize beside Claude Code status line or Codex CLI status line, then pick a starting layout.",
  },
  {
    step: "03",
    icon: Monitor,
    title: "Tune it live",
    copy: "Arrange fields, adjust appearance, and watch the saved statusline update as you work.",
  },
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
        <div className="mx-auto max-w-5xl px-6">
          <p className="mb-5 text-xs font-medium uppercase tracking-[0.25em] text-gray-500 dark:text-gray-400">
            Built into lpm · macOS
          </p>
          <h1 className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-600 bg-clip-text text-[2.25rem] font-extrabold leading-[1.06] tracking-[-0.04em] text-transparent dark:from-white dark:via-gray-100 dark:to-gray-400 sm:text-5xl md:text-[clamp(2.75rem,6.2vh,3.75rem)]">
            Customize Claude Code & Codex statuslines.{" "}
            <span className="block">Without editing config files.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-gray-600 dark:text-gray-400 sm:text-[17px]">
            lpm gives Claude Code and Codex a visual statusline editor.
            Pick a layout, arrange useful signals, tune the appearance, and see
            every change before it applies.
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
                {[
                  "Clean, Minimalistic, Modern, Custom, and Off layouts",
                  "Per-item colors, labels, icons, and custom text",
                  "Separators, Git status, and eight usage meter styles",
                  "Model, project, context, limits, Git, and session cost",
                ].map((item) => (
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
                href="https://code.claude.com/docs/en/statusline"
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
                {[
                  "Essential, Project, Usage, Detailed, and Off layouts",
                  "Model, reasoning, Git, context, limits, tokens, and state",
                  "Task progress, permissions, thread, and workspace details",
                  "Active Codex theme colors with automatic field omission",
                ].map((item) => (
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
                href="https://learn.chatgpt.com/docs/codex/cli"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-7 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-gray-800 transition hover:text-[#087A5E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 dark:text-gray-200 dark:hover:text-[#4FD1AB] dark:focus-visible:ring-white"
              >
                OpenAI Codex CLI docs
                <ArrowRight className="h-4 w-4" aria-hidden />
              </a>
            </article>
          </div>
        </div>
      </section>

      <section className="py-20 sm:py-24">
        <div className="mx-auto max-w-5xl px-6">
          <SectionHeader
            eyebrow="Made for daily agent work"
            title="Your statusline should reduce uncertainty"
          />
          <div className="grid gap-5 md:grid-cols-3">
            {benefits.map(({ icon: Icon, title, copy }) => (
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
            {steps.map(({ step, icon: Icon, title, copy }) => (
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
            title: "Claude Code & Codex token usage in lpm",
            description:
              "Track tokens, estimated cost, cache usage, models, projects, and sessions in a private Mac dashboard.",
          },
          {
            href: AI_AGENTS_PATH,
            title: "Best terminal for Claude Code & Codex",
            description:
              "Run multiple AI coding agents while every project, service, and terminal stays visible.",
          },
          {
            href: CONNECT_AGENTS_PATH,
            title: "Connect agents to your dev environment",
            description:
              "Give Claude Code and Codex tools to run services, inspect logs, and work across project copies.",
          },
          {
            href: SKILLS_PATH,
            title: "Create & edit Claude Code and Codex skills",
            description:
              "Describe a task, let AI draft the SKILL.md, and see what every skill costs in context.",
          },
        ]}
      />

      <Cta />
    </>
  );
}
