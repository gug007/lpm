import { SectionHeader } from "@/components/section-header";

type Outcome = {
  title: string;
  body: string;
};

const OUTCOMES: Outcome[] = [
  {
    title: "Onboard a new repo in minutes.",
    body: "Add any project folder. lpm reads its manifests and sets up the services it finds, so you can hit Start right away. Every service streams live output right away, each tab shows the ports it is actually listening on, and because services start in your login shell, your own version manager picks the Node or Python version.",
  },
  {
    title: "Debug across services without losing the thread.",
    body: "When something breaks, you're watching all five services at once. The error is visible, labeled, and in context — not buried in a shared scroll buffer you have to grep through.",
  },
  {
    title: "Switch between projects without a mental-state reset.",
    body: "Jump to another repo mid-session. Your first project keeps running, logs intact, terminal history preserved. Switch back and pick up exactly where you left off.",
  },
  {
    title: "Hand AI agents a copy, not your checkout.",
    body: "Duplicate or New Worktree gives each agent its own files, terminals, and services, so it can run servers and tests without touching your working copy. Copies use the same port numbers as the original, and lpm flags a clash when you press Start instead of letting one server crash.",
  },
];

export default function Benefits() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="The developer difference"
          title="Four things a stack-aware terminal changes"
          description="What you notice in the first week."
        />
        <ol className="space-y-10">
          {OUTCOMES.map(({ title, body }, i) => (
            <li
              key={title}
              className="grid grid-cols-[auto_1fr] gap-x-6 sm:gap-x-8 items-start"
            >
              <span
                aria-hidden="true"
                className="text-4xl sm:text-5xl font-bold tabular-nums text-gray-200 dark:text-gray-800 leading-none select-none"
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="border-l border-gray-200 dark:border-gray-800 pl-6">
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  {title}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                  {body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
