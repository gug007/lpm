import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { docsPath } from "@/lib/docs-pages";
import { LINUX_HOST_PATH, PARALLEL_PATH } from "@/lib/links";

const PERSONAS = [
  {
    lead: "If you run",
    title: "several agents at once",
    body: "Give each one its own copy of the project and see at a glance which one needs you.",
    link: "Run Claude Code in parallel",
    href: PARALLEL_PATH,
  },
  {
    lead: "If your app needs",
    title: "four services to run",
    body: "Start the web app, API, worker and database with one click, and stop them with another.",
    link: "Set up services",
    href: docsPath("services"),
  },
  {
    lead: "If your agents live on",
    title: "a Mac mini or a server",
    body: "Drive them from your laptop, and answer them from your phone with the laptop shut.",
    link: "Claude Code on a remote server",
    href: LINUX_HOST_PATH,
  },
];

// Right under the demo, so visitors who see themselves in one of these land
// on the page written for their setup instead of finding it in the footer.
export function Personas() {
  return (
    <section aria-labelledby="personas-heading" className="pb-4">
      <div className="mx-auto max-w-5xl px-6">
        <h2 id="personas-heading" className="sr-only">
          Who lpm is for
        </h2>
        <ul className="grid gap-3 sm:grid-cols-3 sm:gap-4">
          {PERSONAS.map((persona) => (
            <li key={persona.href}>
              <Link
                href={persona.href}
                className="group flex h-full flex-col rounded-2xl border border-gray-200 bg-white px-5 py-4 transition-colors hover:border-gray-300 sm:py-5 dark:border-gray-800 dark:bg-white/[0.02] dark:hover:border-gray-700"
              >
                <span className="text-[13px] text-gray-500 dark:text-gray-400">
                  {persona.lead}
                </span>
                <span className="text-[15px] font-semibold tracking-tight text-gray-900 dark:text-white">
                  {persona.title}
                </span>
                <span className="mt-1.5 text-pretty text-[13px] leading-relaxed text-gray-600 dark:text-gray-400">
                  {persona.body}
                </span>
                <span className="mt-auto inline-flex items-center gap-1 pt-3 text-[13px] font-medium text-gray-700 dark:text-gray-300">
                  <span className="underline decoration-gray-300 underline-offset-4 group-hover:decoration-current dark:decoration-gray-600">
                    {persona.link}
                  </span>
                  <ArrowRight
                    className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
