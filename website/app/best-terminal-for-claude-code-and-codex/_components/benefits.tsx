import { SectionHeader } from "@/components/section-header";

type Outcome = {
  title: string;
  body: string;
};

const OUTCOMES: Outcome[] = [
  {
    title: "Every agent in one window, not five tabs",
    body: "Watch Claude Code, Codex, and your whole dev stack from a single macOS window. No more hunting through terminal tabs to find the one that errored.",
  },
  {
    title: "See which agent broke what, in real time",
    body: "Live output per service, side by side. Spot the moment one agent breaks the API while the other is still editing the frontend.",
  },
  {
    title: "Jump between projects visually",
    body: "Switch projects with a click instead of asking \"which tab was that again?\". Your running services and logs follow the project you're on.",
  },
  {
    title: "Native macOS, not a browser tab",
    body: "A real desktop app with dark mode, fast startup, and a built-in config editor. Stays out of the way while your agents do the work.",
  },
];

export default function Benefits() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="Why the desktop app"
          title="What changes when you run agents in a real macOS window"
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
