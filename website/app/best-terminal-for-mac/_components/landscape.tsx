import Link from "next/link";
import { SectionHeader } from "@/components/section-header";
import { AI_AGENTS_PATH } from "@/lib/links";

type Row = {
  name: string;
  whatItIs: string;
  whereItShines: string;
  howLpmDiffers: string;
};

const ROWS: Row[] = [
  {
    name: "Ghostty",
    whatItIs:
      "Fast, native, GPU-accelerated terminal emulator with a platform-native macOS UI.",
    whereItShines:
      "Raw rendering speed and native feel with almost no configuration required.",
    howLpmDiffers:
      "lpm doesn't compete on emulator speed — it manages the project around the terminal. If you only want a faster single pane, pick Ghostty.",
  },
  {
    name: "Warp",
    whatItIs:
      "AI-native terminal with block-based input. Open source — the client has been AGPLv3 since April 2026.",
    whereItShines:
      "AI assistance built into the shell itself: suggestions, command generation, agent features.",
    howLpmDiffers:
      "lpm takes the other route to AI: it runs the agent CLIs you already use — Claude Code, Codex — alongside your services instead of building AI into the shell.",
  },
  {
    name: "iTerm2",
    whatItIs:
      "The mature macOS standard, deeply configurable after 15+ years of development.",
    whereItShines:
      "Split panes, profiles, triggers, tmux integration — a setting for nearly everything.",
    howLpmDiffers:
      "iTerm2 manages sessions; lpm manages projects. One click starts the whole stack, with live output per service.",
  },
  {
    name: "WezTerm",
    whatItIs:
      "Cross-platform GPU-accelerated emulator configured entirely in Lua.",
    whereItShines:
      "One scriptable config that follows you across macOS, Linux, and Windows.",
    howLpmDiffers:
      "lpm is built for the Mac, and its per-project setup is edited in the app rather than scripted in Lua — it starts your services, not just your shell.",
  },
  {
    name: "Alacritty",
    whatItIs:
      "Minimal GPU-accelerated emulator — deliberately no tabs or splits; most people pair it with tmux.",
    whereItShines:
      "Doing one thing fast. The simplest terminal on this list, by design.",
    howLpmDiffers:
      "The opposite philosophy: lpm puts services, project switching, and AI agents in one window. If minimalism is the point, Alacritty is the better pick.",
  },
];

export default function Landscape() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-5xl mx-auto px-6">
        <SectionHeader
          eyebrow="The 2026 field"
          title="Ghostty, Warp, iTerm2, WezTerm, Alacritty — and lpm"
          description="All five are good terminal emulators, and lpm is not trying to out-render them. Here is what each one is, where it wins, and where lpm sits."
          className="mb-12"
        />

        <div className="@container relative">
          <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-800">
            <table className="w-full min-w-[52rem] text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/80 dark:border-gray-800 dark:bg-white/[0.025]">
                  <th
                    scope="col"
                    className="sticky left-0 z-20 bg-gray-50 px-5 py-4 text-left font-medium text-gray-500 dark:bg-[#171717] dark:text-gray-400"
                  >
                    Terminal
                  </th>
                  <th
                    scope="col"
                    className="w-[28%] px-4 py-4 text-left font-medium text-gray-500 dark:text-gray-400"
                  >
                    What it is
                  </th>
                  <th
                    scope="col"
                    className="w-[28%] px-4 py-4 text-left font-medium text-gray-500 dark:text-gray-400"
                  >
                    Where it shines
                  </th>
                  <th
                    scope="col"
                    className="w-[32%] px-4 py-4 text-left font-medium text-gray-500 dark:text-gray-400"
                  >
                    How lpm differs
                  </th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row, i) => (
                  <tr
                    key={row.name}
                    className={
                      i < ROWS.length - 1
                        ? "border-b border-gray-200 dark:border-gray-800"
                        : ""
                    }
                  >
                    <th
                      scope="row"
                      className="sticky left-0 z-10 bg-white px-5 py-4 text-left align-top font-semibold text-gray-900 dark:bg-[#111] dark:text-white"
                    >
                      {row.name}
                    </th>
                    <td className="px-4 py-4 align-top leading-relaxed text-gray-600 dark:text-gray-400">
                      {row.whatItIs}
                    </td>
                    <td className="px-4 py-4 align-top leading-relaxed text-gray-600 dark:text-gray-400">
                      {row.whereItShines}
                    </td>
                    <td className="px-4 py-4 align-top leading-relaxed text-gray-700 dark:text-gray-300">
                      {row.howLpmDiffers}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-px right-px w-10 rounded-r-[15px] bg-gradient-to-l from-white to-transparent @min-[53rem]:hidden dark:from-[#111]"
          />
        </div>

        <p className="mt-6 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
          lpm is not a raw emulator replacement. It is for the day your
          terminal stops being one shell and becomes the place a whole project
          runs — dev servers with live logs, one-click switching between
          repos, and coding agents working next to your services. If agents
          are the reason you&apos;re shopping, see the guide to the{" "}
          <Link
            href={AI_AGENTS_PATH}
            className="underline underline-offset-2 hover:text-gray-900 dark:hover:text-white"
          >
            best terminal for Claude Code and Codex
          </Link>
          .
        </p>
      </div>
    </section>
  );
}
