import { Check, Minus, X } from "lucide-react";
import { SectionHeader } from "@/components/section-header";

type Verdict = "yes" | "no" | "partly";

const ANSWERS: {
  verdict: Verdict;
  label: string;
  title: string;
  body: string;
}[] = [
  {
    verdict: "yes",
    label: "Yes — this is the model",
    title: "A list of projects",
    body: "One row per project you work on: the checkout app, a client site, a hotfix copy, a remote box. Selecting a row opens that project — its terminals, its services, its git state. Everything else on this page describes what those rows can tell you.",
  },
  {
    verdict: "no",
    label: "No",
    title: "A file explorer or file tree",
    body: "Rows are projects, not paths. The sidebar lists projects and stops there — no row expands into src/ and none of them previews a file. Files are one level in: open the project for lpm's diff and file views, or open its folder in Finder or your editor. Browsing a tree is your editor's job; lpm sits beside it rather than replacing it.",
  },
  {
    verdict: "no",
    label: "No",
    title: "A vertical strip of shell tabs",
    body: "Turning a horizontal tab row on its side gives you the same flat list, only taller — twelve sessions are still twelve entries. In lpm a project's terminals live inside that project, so the sidebar length tracks how many projects you have, not how many shells.",
  },
  {
    verdict: "partly",
    label: "Not the primary model",
    title: "A saved SSH host list",
    body: "lpm is not an SSH host manager, but SSH projects sit in the same project list as local ones — no separate SSH badge on the row. A paired Mac or host appears as its own section beneath your local projects, headed by that machine's name.",
  },
];

const STYLES: Record<
  Verdict,
  { icon: typeof Check; chip: string; card: string }
> = {
  yes: {
    icon: Check,
    chip: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
    card: "border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/60 dark:bg-emerald-400/[0.04]",
  },
  no: {
    icon: X,
    chip: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
    card: "border-gray-200 dark:border-gray-800",
  },
  partly: {
    icon: Minus,
    chip: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
    card: "border-gray-200 dark:border-gray-800",
  },
};

export default function WhichSidebar() {
  return (
    <section className="py-20 sm:py-24">
      <div className="mx-auto max-w-5xl px-6">
        <SectionHeader
          eyebrow="Disambiguation"
          title="Which sidebar are you looking for?"
          description="“Terminal with sidebar” means several different things. If you came looking for an editor's slide-out terminal drawer, that is a different category — lpm is a standalone terminal app, not a panel inside one. Here is what its sidebar is and is not."
          className="mb-12"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          {ANSWERS.map(({ verdict, label, title, body }) => {
            const { icon: Icon, chip, card } = STYLES[verdict];
            return (
              <article
                key={title}
                className={`rounded-2xl border p-6 shadow-sm ${card}`}
              >
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide ${chip}`}
                >
                  <Icon className="h-3 w-3" aria-hidden />
                  {label}
                </span>
                <h3 className="mt-3 font-semibold text-gray-900 dark:text-gray-100">
                  {title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                  {body}
                </p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
