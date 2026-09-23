import type { Metadata } from "next";
import {
  ArrowDown,
  ArrowRight,
  Check,
  Code2,
  Gauge,
  PencilLine,
  Sparkles,
  Terminal,
} from "lucide-react";
import { HeroCta } from "@/components/home/hero-cta";
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
import DialogPreview from "./_components/dialog-preview";
import Faq from "./_components/faq";
import {
  BENEFITS,
  CLAUDE_ITEMS,
  CLAUDE_SKILLS_DOCS,
  CODEX_ITEMS,
  CODEX_SKILLS_DOCS,
  STEPS,
} from "./_components/skills-data";
import ToolkitOverview from "./_components/toolkit-overview";

const TITLE = "Create & Edit Claude Code and Codex Skills";
const DESCRIPTION =
  "Create and edit Claude Code and Codex skills in lpm for Mac: AI drafts the SKILL.md, you pick who runs it, and every skill shows its per-turn context cost.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "Claude Code skills",
    "create Claude Code skill",
    "Claude Code skill editor",
    "SKILL.md",
    "Codex skills",
    "Codex custom prompts",
    "agent skills manager",
    "Claude Code slash command",
    "macOS developer tools",
  ],
  alternates: {
    canonical: SKILLS_PATH,
  },
  openGraph: {
    title: TITLE,
    description:
      "Create and edit Claude Code and Codex skills with AI drafting, run modes, per-skill context cost, and a view of everything each CLI loads.",
    type: "website",
    url: SKILLS_PATH,
    siteName: "lpm",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description:
      "A visual skill editor for Claude Code and Codex, built into lpm for macOS.",
  },
};

const structuredData = [
  webPageJsonLd({
    title: TITLE,
    description: DESCRIPTION,
    path: SKILLS_PATH,
    about: [
      "Claude Code skills",
      "Codex skills",
      "SKILL.md editor",
      "macOS developer tools",
    ],
  }),
  breadcrumbJsonLd([
    { name: "Home", path: "/" },
    {
      name: "Claude Code & Codex Skills",
      path: SKILLS_PATH,
    },
  ]),
];

export default function ClaudeCodeCodexSkillsPage() {
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
            Create Claude Code & Codex skills.{" "}
            <span className="block">Without hand-writing SKILL.md.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-3xl text-pretty text-base leading-relaxed text-gray-600 dark:text-gray-400 sm:text-[17px]">
            lpm lists the skills Claude Code and Codex load in each project,
            shows what each one costs in context, and gives you one dialog to
            create and edit them, with AI drafting the fields from a
            plain-English description.
          </p>
          <div className="mt-[clamp(1rem,2vh,1.5rem)] flex flex-wrap items-center justify-center gap-x-5 gap-y-3 text-xs text-gray-500 dark:text-gray-400">
            <span className="inline-flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              AI drafts the fields
            </span>
            <span className="inline-flex items-center gap-2">
              <PencilLine className="h-3.5 w-3.5" aria-hidden />
              Edit skills in place
            </span>
            <span className="inline-flex items-center gap-2">
              <Gauge className="h-3.5 w-3.5" aria-hidden />
              Context cost, visible
            </span>
          </div>
          <div className="mx-auto mt-[clamp(1.25rem,3vh,1.75rem)] max-w-3xl">
            <HeroCta
              source="skills-hero"
              secondary={
                <a
                  href="#dialog"
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-gray-300 px-6 py-[13px] text-[15px] font-medium text-gray-700 transition-colors duration-200 hover:border-gray-400 hover:text-gray-900 dark:border-gray-700 dark:text-gray-300 dark:hover:border-gray-500 dark:hover:text-white"
                >
                  <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                  See the New skill dialog
                </a>
              }
            />
          </div>
        </div>
      </section>

      <DialogPreview />

      <section className="border-y border-gray-100 bg-gray-50/70 py-20 dark:border-gray-800/70 dark:bg-white/[0.015] sm:py-24">
        <div className="mx-auto max-w-5xl px-6">
          <SectionHeader
            eyebrow="One dialog, both CLIs"
            title="Skills live in folders — lpm keeps track of them"
            description="Claude Code and Codex each read skills from their own folders. lpm lists the skills in each one, plugin skills included, and writes new skills where the CLI you pick will read them."
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
                <span className="rounded-full bg-[#D97757]/10 px-2.5 py-1 font-mono text-[11px] font-semibold text-[#B75F40] dark:text-[#F09978]">
                  /skill-name
                </span>
              </div>
              <p className="mt-5 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                lpm writes a standard SKILL.md, so everything works exactly as
                if you had written it by hand.
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
                href={CLAUDE_SKILLS_DOCS}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-7 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-gray-800 transition hover:text-[#B75F40] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 dark:text-gray-200 dark:hover:text-[#F09978] dark:focus-visible:ring-white"
              >
                Claude Code skills docs
                <ArrowRight className="h-4 w-4" aria-hidden />
              </a>
            </article>

            <article className="rounded-3xl border border-[#10A37F]/25 bg-white p-6 shadow-sm dark:bg-[#151515] sm:p-8">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#10A37F]/12 text-[#10A37F]">
                    <Terminal className="h-5 w-5" aria-hidden />
                  </span>
                  <h3 className="text-xl font-bold text-gray-950 dark:text-white">
                    Codex
                  </h3>
                </div>
                <span className="rounded-full bg-[#10A37F]/10 px-2.5 py-1 font-mono text-[11px] font-semibold text-[#087A5E] dark:text-[#4FD1AB]">
                  $skill-name
                </span>
              </div>
              <p className="mt-5 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                The same dialog writes Codex skills, including the shared folder
                other agent CLIs read too.
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
                href={CODEX_SKILLS_DOCS}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-7 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-gray-800 transition hover:text-[#087A5E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 dark:text-gray-200 dark:hover:text-[#4FD1AB] dark:focus-visible:ring-white"
              >
                Codex skills docs
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
            title="Skills should be easy to write and cheap to keep"
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
            title="From idea to installed skill in a minute"
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

      <ToolkitOverview />

      <Faq />

      <RelatedPages
        links={[
          {
            href: STATUSLINE_PATH,
            title: "Claude Code & Codex statusline editor",
            description:
              "Pick presets, reorder fields, tune colors and meters, and watch the statusline update live.",
          },
          {
            href: CLAUDE_ACCOUNTS_PATH,
            title: "Multiple Claude Code accounts",
            description:
              "Pin an account to each project; skills, subagents and commands are shared across all of them.",
          },
          {
            href: TOKEN_USAGE_PATH,
            title: "Claude Code & Codex usage and limits",
            description:
              "Tokens and cost by project, plus live 5-hour and weekly limit meters, in a private Mac app.",
          },
          {
            href: CONNECT_AGENTS_PATH,
            title: "Connect agents to your dev environment",
            description:
              "Give Claude Code and Codex tools to run services, inspect logs, and work across project copies.",
          },
          {
            href: AI_AGENTS_PATH,
            title: "Best terminal for Claude Code & Codex",
            description:
              "Run multiple AI coding agents while every project, service, and terminal stays visible.",
          },
          {
            href: FEATURES_PATH,
            title: "Everything lpm does",
            description:
              "Every panel in the app, from services and review to automations and remote machines, on one page.",
          },
        ]}
      />

      <Cta />
    </>
  );
}
