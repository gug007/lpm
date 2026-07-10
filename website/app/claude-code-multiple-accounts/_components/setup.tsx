import { Fragment } from "react";
import { SectionHeader } from "@/components/section-header";

type Step = {
  title: string;
  body: string;
  path?: string[];
};

const STEPS: Step[] = [
  {
    title: "Add your accounts",
    body: "Name them anything — Work, Client A. Your current login stays the default; you only add the extra ones.",
    path: ["Settings", "AI & Integrations", "Add account"],
  },
  {
    title: "Pin a project",
    body: "Pick an account in the project's config form, or set claudeAccount in its YAML. Save.",
    path: ["Project", "Config", "Claude account"],
  },
  {
    title: "Sign in once",
    body: "The first terminal you open there runs Claude's normal browser sign-in for that account — the last time you'll see it.",
  },
  {
    title: "Just work",
    body: "Every terminal and AI feature in the project now uses its account. Other projects run theirs — in parallel.",
  },
];

export default function Setup() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-5xl mx-auto px-6">
        <SectionHeader
          eyebrow="Setup"
          title="Zero to pinned in four steps"
          description="One-time setup, about two minutes. No config files required — the app writes them for you."
        />
        <ol className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(({ title, body, path }, i) => (
            <li key={title} className="relative">
              <span
                aria-hidden="true"
                className="block text-5xl font-bold tabular-nums text-gray-200 dark:text-gray-800 leading-none select-none mb-4"
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1.5">
                {title}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                {body}
              </p>
              {path && (
                <p className="mt-3 flex flex-wrap items-center gap-1 text-[10px] font-mono text-gray-500 dark:text-gray-400">
                  {path.map((crumb, j) => (
                    <Fragment key={crumb}>
                      {j > 0 && (
                        <span
                          aria-hidden="true"
                          className="text-gray-300 dark:text-gray-600"
                        >
                          ›
                        </span>
                      )}
                      <span className="rounded bg-gray-100 dark:bg-gray-800/70 px-1.5 py-0.5">
                        {crumb}
                      </span>
                    </Fragment>
                  ))}
                </p>
              )}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
