import Link from "next/link";
import { Fragment } from "react";
import { SectionHeader } from "@/components/section-header";
import { CONFIG_PATH } from "@/lib/links";

type Step = {
  title: string;
  body: string;
  path?: string[];
};

const STEPS: Step[] = [
  {
    title: "Add your accounts",
    body: "Name them anything: Work, Client A. Your current login stays the default; you only add the extra ones.",
    path: ["Settings", "AI & Integrations", "Add account"],
  },
  {
    title: "Sign in once",
    body: "Click Sign in next to the account. lpm opens Claude's own sign-in for it, then shows the email you signed in with.",
    path: ["Settings", "AI & Integrations", "Sign in"],
  },
  {
    title: "Pin a project",
    body: "Pick the account in the project's config form and save. Settings lists which projects use each account.",
    path: ["Project", "Config", "Claude account"],
  },
  {
    title: "Just work",
    body: "Every terminal in the project, and lpm's commit, PR, and branch helpers, now use its account. Other projects run theirs at the same time.",
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

        <p className="mx-auto mt-12 max-w-md text-center text-xs leading-relaxed text-gray-500 dark:text-gray-400">
          Prefer text? The pin is one line in the project&rsquo;s config file,
          and the{" "}
          <Link
            href={CONFIG_PATH}
            className="font-medium text-gray-700 underline decoration-gray-300 underline-offset-2 hover:text-gray-900 dark:text-gray-300 dark:decoration-gray-600 dark:hover:text-white"
          >
            config reference
          </Link>{" "}
          has the key.
        </p>
      </div>
    </section>
  );
}
