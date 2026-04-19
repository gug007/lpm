import { SectionHeader } from "@/components/section-header";

type Outcome = {
  title: string;
  body: string;
};

const OUTCOMES: Outcome[] = [
  {
    title: "Your MacBook stays cool and quiet",
    body: "No Electron runtime means no hot laps. Your M-series chip runs your services, not a Chromium shell. Battery life you used to lose to Hyper comes back.",
  },
  {
    title: "Your stack boots in one click, not ten cd's",
    body: "Open a project in the sidebar and hit Start. API, worker, database, frontend — all live, all visible, all in one native window.",
  },
  {
    title: "Switching projects stops wiping your context",
    body: "Jump to another repo and your first project keeps running in the background. Come back and it's still there — logs intact, servers up, terminal history preserved.",
  },
  {
    title: "You stop losing services in a sea of tabs",
    body: "Every running service has its own pane with a clear label. No guessing which iTerm2 tab has the migration running.",
  },
];

export default function Benefits() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="Why developers switch"
          title="What changes when you stop fighting your terminal"
          description="Four outcomes you'll feel in the first hour."
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
