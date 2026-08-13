import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Code2,
  Eye,
  FileSliders,
  LockKeyhole,
  Monitor,
  Save,
  Settings2,
  SlidersHorizontal,
  WandSparkles,
} from "lucide-react";
import { HeroDownload } from "@/components/home/hero-download";
import { RelatedPages } from "@/components/related-pages";
import { SectionHeader } from "@/components/section-header";
import {
  AI_AGENTS_PATH,
  CLAUDE_ACCOUNTS_PATH,
  CONNECT_AGENTS_PATH,
  RELEASES_URL,
  SITE_URL,
  STATUSLINE_PATH,
  TOKEN_USAGE_PATH,
} from "@/lib/links";
import {
  breadcrumbJsonLd,
  faqJsonLd,
  jsonLdString,
  webPageJsonLd,
} from "@/lib/structured-data";
import LpmStatuslineDemo from "./_components/lpm-statusline-demo";

const TITLE = "Customize Claude Code & Codex Statuslines in lpm";
const DESCRIPTION =
  "Customize Claude Code and Codex statuslines visually in lpm Desktop for macOS. Pick presets, reorder fields, tune colors and meters, preview live, and apply automatically.";

const FAQ_ITEMS = [
  {
    question: "How do I customize a Claude Code statusline in lpm Desktop?",
    answer:
      "Open Settings from the bottom of the lpm sidebar, choose AI & Integrations, and click Customize beside Claude Code status line. Start with Clean, Minimalistic, Modern, or Custom, then arrange items and tune their appearance. lpm applies valid changes while you work.",
  },
  {
    question: "What can I change in the Claude Code statusline?",
    answer:
      "You can arrange the project folder, full path, model, Git branch, context remaining, five-hour usage, weekly usage, session cost, and custom text. Each item can have its own color, label, and icon. You can also choose separators, usage meter styles, meter width, icons, and Git status.",
  },
  {
    question: "How does Codex statusline customization work in lpm?",
    answer:
      "lpm shows the fields supported by your Codex version, including model, reasoning, project, Git, context, limits, tokens, run state, permissions, task progress, and thread details. Pick a preset, add or remove fields, reorder them, and choose whether Codex uses its active theme colors.",
  },
  {
    question: "Do I need to edit settings.json or config.toml?",
    answer:
      "No. lpm provides visual controls and saves the matching local configuration for Claude Code or Codex. You can customize either statusline without hand-editing scripts, JSON, or TOML.",
  },
  {
    question: "Can lpm hide the statusline?",
    answer:
      "Yes. Choose Off to hide the configurable statusline. For Codex, removing every item also hides the footer. You can return to a preset or add fields again at any time.",
  },
  {
    question: "Does the statusline use extra AI tokens?",
    answer:
      "No. The statusline formats session information already exposed by Claude Code or Codex. Previewing and rendering it does not send an additional model request.",
  },
  {
    question: "Is statusline configuration private?",
    answer:
      "Yes. lpm is a native macOS app and applies statusline settings locally on your Mac. The visual editor does not require you to paste agent configuration or session data into a website.",
  },
];

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "Claude Code statusline",
    "Claude Code status line",
    "Codex statusline",
    "Codex status line",
    "lpm Desktop",
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
      "Use lpm Desktop to visually customize Claude Code and Codex statuslines with presets, live preview, fields, colors, and usage meters.",
    type: "website",
    url: STATUSLINE_PATH,
    siteName: "lpm",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description:
      "Visual statusline customization for Claude Code and Codex, built into lpm Desktop for macOS.",
  },
};

const structuredData = [
  webPageJsonLd({
    title: TITLE,
    description: DESCRIPTION,
    path: STATUSLINE_PATH,
    about: [
      "lpm Desktop",
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
  faqJsonLd(FAQ_ITEMS),
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "lpm Desktop",
    description: DESCRIPTION,
    url: `${SITE_URL}${STATUSLINE_PATH}`,
    downloadUrl: RELEASES_URL,
    applicationCategory: "DeveloperApplication",
    operatingSystem: "macOS",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    featureList: [
      "Visual Claude Code statusline editor",
      "Visual Codex statusline editor",
      "Live terminal preview",
      "Statusline presets and field ordering",
      "Claude Code colors, separators, icons, and usage meters",
      "Automatic local configuration",
    ],
  },
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
    copy: "In lpm Desktop, click Settings at the bottom of the sidebar and select AI & Integrations.",
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

      <section className="relative overflow-hidden pt-28 pb-12 text-center sm:pt-40 sm:pb-16">
        <div className="absolute inset-x-0 top-0 -z-10 h-[50rem] bg-[radial-gradient(circle_at_20%_14%,rgba(217,119,87,0.17),transparent_28%),radial-gradient(circle_at_80%_12%,rgba(16,163,127,0.16),transparent_27%)] dark:bg-[radial-gradient(circle_at_20%_14%,rgba(217,119,87,0.22),transparent_28%),radial-gradient(circle_at_80%_12%,rgba(16,163,127,0.2),transparent_27%)]" />
        <div className="mx-auto max-w-5xl px-6">
          <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white/75 px-3 py-1.5 text-xs font-medium text-gray-600 shadow-sm backdrop-blur dark:border-gray-800 dark:bg-white/[0.04] dark:text-gray-300">
            <WandSparkles className="h-3.5 w-3.5" aria-hidden />
            Built into lpm Desktop · macOS
          </p>
          <h1 className="bg-gradient-to-br from-gray-950 via-gray-800 to-gray-500 bg-clip-text text-4xl font-extrabold leading-[1.04] tracking-[-0.04em] text-transparent dark:from-white dark:via-gray-100 dark:to-gray-500 sm:text-6xl lg:text-7xl">
            Customize your AI statuslines.{" "}
            <span className="block">Without editing config files.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-gray-600 dark:text-gray-400 sm:text-lg">
            lpm Desktop gives Claude Code and Codex a visual statusline editor.
            Pick a layout, arrange useful signals, tune the appearance, and see
            every change before it applies.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-3 text-xs text-gray-500 dark:text-gray-400">
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
          <div className="mt-9 flex flex-col items-center gap-4">
            <HeroDownload />
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
            eyebrow="Three steps in lpm Desktop"
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

      <section className="py-20 sm:py-24">
        <div className="mx-auto max-w-3xl px-6">
          <SectionHeader
            eyebrow="lpm statusline customization FAQ"
            title="What to know before you customize"
          />
          <ul className="space-y-3">
            {FAQ_ITEMS.map((item) => (
              <li key={item.question}>
                <details className="group rounded-2xl border border-gray-200 transition-colors duration-200 hover:border-gray-300 open:border-gray-300 open:bg-gray-50/50 dark:border-gray-800 dark:hover:border-gray-700 dark:open:border-gray-700 dark:open:bg-white/[0.02]">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-semibold text-gray-900 dark:text-gray-100 [&::-webkit-details-marker]:hidden">
                    <span>{item.question}</span>
                    <ChevronDown className="h-4 w-4 shrink-0 text-gray-500 transition-transform duration-200 group-open:rotate-180 dark:text-gray-400" />
                  </summary>
                  <div className="px-5 pb-4 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                    {item.answer}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </div>
      </section>

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
            href: CLAUDE_ACCOUNTS_PATH,
            title: "Multiple Claude Code accounts",
            description:
              "Keep work and personal Claude accounts attached to the right projects on your Mac.",
          },
        ]}
      />

      <section className="py-20 text-center sm:py-24">
        <div className="mx-auto max-w-3xl px-6">
          <h2 className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-600 bg-clip-text text-3xl font-extrabold leading-[1.1] tracking-tight text-transparent dark:from-white dark:via-gray-100 dark:to-gray-400 sm:text-5xl">
            Put Claude Code and Codex in one visible workspace.
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-gray-600 dark:text-gray-400 sm:text-lg">
            lpm keeps agents, statuslines, services, logs, Git changes, and
            project copies together in one native macOS app.
          </p>
          <div className="mt-10 flex justify-center">
            <HeroDownload />
          </div>
          <div className="mt-8">
            <Link
              href={AI_AGENTS_PATH}
              className="inline-flex min-h-11 items-center gap-1.5 px-3 text-[13px] text-gray-500 transition-colors duration-200 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 dark:text-gray-400 dark:hover:text-white dark:focus-visible:ring-white"
            >
              See the complete AI agent workflow
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
