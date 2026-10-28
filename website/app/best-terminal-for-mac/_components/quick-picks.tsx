import { SectionHeader } from "@/components/section-header";

type Pick = {
  name: string;
  bestFor: string;
  why: string;
  price: string;
};

const PICKS: Pick[] = [
  {
    name: "lpm",
    bestFor: "Running whole projects and coding agents",
    why: "Split panes and search like any terminal, plus a project sidebar, one-click start for every dev server, and live status for Claude Code and Codex.",
    price: "Free, open source",
  },
  {
    name: "Ghostty",
    bestFor: "Speed with a native Mac feel",
    why: "Its macOS interface is written in Swift with AppKit and SwiftUI, and tabs and splits work out of the box with almost no setup.",
    price: "Free, open source",
  },
  {
    name: "iTerm2",
    bestFor: "Power users who want a setting for everything",
    why: "Profiles, triggers, split panes and tmux integration, refined over many years as the Mac default for developers.",
    price: "Free, open source",
  },
  {
    name: "Warp",
    bestFor: "AI built into the shell",
    why: "Block-based input with an agent inside the terminal that writes and runs commands for you.",
    price: "Free plan; AI plans from $20/month",
  },
  {
    name: "WezTerm",
    bestFor: "One config on Mac, Linux and Windows",
    why: "Configured in Lua, with a built-in multiplexer for panes, tabs and remote hosts.",
    price: "Free, open source",
  },
  {
    name: "Kitty",
    bestFor: "Keyboard-driven tinkerers",
    why: "Renders with OpenGL, arranges tabs and windows in split layouts, and extends with small programs called kittens, all set in one kitty.conf.",
    price: "Free, open source",
  },
  {
    name: "Alacritty",
    bestFor: "Minimalists who pair it with tmux",
    why: "A fast OpenGL renderer with deliberately no tabs or splits; your multiplexer handles the rest.",
    price: "Free, open source",
  },
  {
    name: "Terminal.app",
    bestFor: "Nothing to install",
    why: "Already on every Mac, with tabs and profiles. Enough for occasional commands, thin for a full day of development.",
    price: "Free, built into macOS",
  },
];

export default function QuickPicks() {
  return (
    <section id="quick-picks" className="scroll-mt-20 py-16 sm:py-20">
      <div className="max-w-5xl mx-auto px-6">
        <SectionHeader
          eyebrow="Quick picks"
          title="The best terminal for Mac in 2026, by what you need"
          description="Eight terminals worth installing, and who each one suits best. lpm is ours; the other seven are the picks we would make if it did not exist."
          className="mb-10"
        />

        <ol className="divide-y divide-gray-200 rounded-2xl border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
          {PICKS.map((pick, i) => (
            <li
              key={pick.name}
              className="grid gap-x-6 gap-y-1.5 px-5 py-4 md:grid-cols-[11rem_15rem_1fr] md:items-baseline"
            >
              <div className="flex items-baseline gap-2.5">
                <span className="w-4 shrink-0 text-xs tabular-nums text-gray-400 dark:text-gray-500">
                  {i + 1}
                </span>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                  {pick.name}
                </h3>
              </div>
              <p className="pl-[1.625rem] text-sm font-medium text-gray-700 md:pl-0 dark:text-gray-300">
                {pick.bestFor}
              </p>
              <div className="pl-[1.625rem] text-sm leading-relaxed text-gray-600 md:pl-0 dark:text-gray-400">
                <p>{pick.why}</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">
                  {pick.price}
                </p>
              </div>
            </li>
          ))}
        </ol>

        <p className="mt-5 text-center text-sm text-gray-500 dark:text-gray-400">
          <a
            href="#terminal-landscape"
            className="underline underline-offset-2 hover:text-gray-900 dark:hover:text-white"
          >
            See where each one wins and where lpm differs
          </a>
        </p>
      </div>
    </section>
  );
}
