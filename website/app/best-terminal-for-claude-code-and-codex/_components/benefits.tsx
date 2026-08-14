import { SectionHeader } from "@/components/section-header";

type Outcome = {
  title: string;
  body: string;
};

const OUTCOMES: Outcome[] = [
  {
    title: "A second agent starts on a copy that already runs",
    body: "Duplicate copies the whole project folder, so the new copy arrives with node_modules, .venv, .env files, and your uncommitted work already in place — no reinstall, no re-configuring, no \"it works on my other checkout\". If you want the copy on its own branch instead, the same dialog creates a Git worktree — a real checkout of your current commit, so it starts clean: uncommitted changes and ignored files like node_modules and .env stay behind in the original.",
  },
  {
    title: "One prompt, up to 50 answers to choose from",
    body: "Set a copy count in the Duplicate dialog — anywhere from 1 to 50 — and queue the same prompt in every copy at once. Claude Code, Codex, and Gemini CLI each attack the task in their own checkout, and you keep the version you like instead of rerolling the same session and hoping.",
  },
  {
    title: "You find out an agent is waiting without checking on it",
    body: "Each session carries its own status in the sidebar, so a terminal that has finished or is blocked on a question announces itself. You go back to the one agent that needs you instead of cycling through five to see who stopped.",
  },
  {
    title: "You see how much of your plan the agents have burned",
    body: "Claude and Codex each get a usage line in the sidebar: how much of the window is gone and when it comes back, for whichever window you pick — weekly out of the box, or the 5-hour one. Hover the line and both windows open together. When several agents run all afternoon, you know how much room is left before a limit lands mid-refactor.",
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
