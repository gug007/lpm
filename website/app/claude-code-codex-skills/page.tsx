import type { Metadata } from "next";
import {
  ArrowDown,
  ArrowRight,
  Check,
  Code2,
  Gauge,
  Layers,
  PencilLine,
  Plus,
  Sparkles,
  Terminal,
} from "lucide-react";
import { HeroCta } from "@/components/home/hero-cta";
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
import DialogPreview from "./_components/dialog-preview";
import Faq from "./_components/faq";

const TITLE = "Create & Edit Claude Code and Codex Skills";
const DESCRIPTION =
  "Create and edit Claude Code and Codex skills visually in lpm for macOS. Describe the task, let AI draft the SKILL.md, choose who runs it, and see what every skill costs in context.";

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
      "Use lpm to create and edit Claude Code and Codex skills with AI drafting, run modes, and per-skill context cost.",
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
      name: "lpm skill editor",
      path: SKILLS_PATH,
    },
  ]),
];

const benefits = [
  {
    icon: Sparkles,
    title: "Describe it, AI drafts it",
    copy: "Type one sentence about the task. lpm reads your repository and drafts the name, description, and instructions to match how your project actually works. Nothing is saved until you click Create.",
  },
  {
    icon: PencilLine,
    title: "Edit without breaking files",
    copy: "Reopen any skill — including ones you wrote by hand — and change its description, instructions, or who runs it. lpm rewrites only the fields you touched and leaves everything else exactly as it was.",
  },
  {
    icon: Gauge,
    title: "See what skills cost",
    copy: "Skill descriptions are loaded before every turn; instructions only when a skill runs. lpm estimates both, so you know which skills are cheap to keep and which deserve a manual-only switch.",
  },
];

const steps = [
  {
    step: "01",
    icon: Layers,
    title: "Open Skills & tools",
    copy: "Press ⌘⇧K in any project, or pick Skills & tools from the ˅ menu beside the terminal tabs. lpm scans every folder Claude Code and Codex read skills from and lists what it finds.",
  },
  {
    step: "02",
    icon: Plus,
    title: "Create a new skill",
    copy: "Click New skill, describe the task, and let AI draft the fields — or fill in the name, description, and instructions yourself.",
  },
  {
    step: "03",
    icon: PencilLine,
    title: "Refine as you go",
    copy: "Pick who runs it and press Create. Reopen the same dialog any time to edit, and deleted skills go to the Trash — never gone for good.",
  },
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
            lpm scans every folder your agents read skills from, shows what each
            skill costs in context, and gives you one dialog to create and edit
            them — with AI drafting the fields from a plain-English description.
          </p>
          <div className="mt-[clamp(1rem,2vh,1.5rem)] flex flex-wrap items-center justify-center gap-x-5 gap-y-3 text-xs text-gray-500 dark:text-gray-400">
            <span className="inline-flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              AI drafts the fields
            </span>
            <span className="inline-flex items-center gap-2">
              <PencilLine className="h-3.5 w-3.5" aria-hidden />
              Edit any skill in place
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
            title="Skills live in folders — lpm knows them all"
            description="Claude Code and Codex each read skills from their own places. lpm scans every root, shows what is installed for each CLI, and writes new skills where the CLI you pick will read them."
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
                {[
                  "Personal skills in ~/.claude/skills, project skills next to your code",
                  "Auto-run when the description matches, or manual-only on request",
                  "Manual-only skills stay out of context entirely — zero tokens up front",
                  "Per-skill estimates of what each description costs every turn",
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
                href="https://code.claude.com/docs/en/skills"
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
                {[
                  "Skills in ~/.codex/skills, plus the shared ~/.agents/skills folder",
                  "Invoked with $name — lpm shows the right token for each folder",
                  "Manual-only supported here too, kept out of context until you call it",
                  "Descriptions validated against what both CLIs actually accept",
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
            title="Skills should be easy to write and cheap to keep"
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
            title="From idea to installed skill in a minute"
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
            href: STATUSLINE_PATH,
            title: "Claude Code & Codex statusline customization",
            description:
              "Pick presets, reorder fields, tune colors and meters, and preview the statusline live.",
          },
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
        ]}
      />

      <Cta />
    </>
  );
}
