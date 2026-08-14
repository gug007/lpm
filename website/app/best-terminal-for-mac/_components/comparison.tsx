import { Check, X } from "lucide-react";
import { SectionHeader } from "@/components/section-header";

type AlternativeKey = "lpm" | "iterm2" | "terminal" | "tmux" | "hyper" | "warp";

type Capability = {
  label: string;
} & Record<AlternativeKey, boolean>;

const ALTERNATIVES: { key: AlternativeKey; label: string }[] = [
  { key: "lpm", label: "lpm" },
  { key: "iterm2", label: "iTerm2" },
  { key: "terminal", label: "Terminal.app" },
  { key: "tmux", label: "tmux" },
  { key: "hyper", label: "Hyper" },
  { key: "warp", label: "Warp" },
];

const CAPABILITIES: Capability[] = [
  {
    label: "Native Apple Silicon build, no Electron runtime",
    lpm: true,
    iterm2: true,
    terminal: true,
    tmux: true,
    hyper: false,
    warp: true,
  },
  {
    label: "Free",
    lpm: true,
    iterm2: true,
    terminal: true,
    tmux: true,
    hyper: true,
    warp: true,
  },
  {
    label: "Open source",
    lpm: true,
    iterm2: true,
    terminal: false,
    tmux: true,
    hyper: true,
    warp: true,
  },
  {
    label: "Visual project switcher with live state",
    lpm: true,
    iterm2: false,
    terminal: false,
    tmux: false,
    hyper: false,
    warp: false,
  },
  {
    label: "Built-in project-aware full-stack start",
    lpm: true,
    iterm2: false,
    terminal: false,
    tmux: false,
    hyper: false,
    warp: false,
  },
  {
    label: "Built-in service definitions with live output",
    lpm: true,
    iterm2: false,
    terminal: false,
    tmux: false,
    hyper: false,
    warp: false,
  },
  {
    label: "AI writes the project setup from your stack",
    lpm: true,
    iterm2: false,
    terminal: false,
    tmux: false,
    hyper: false,
    warp: false,
  },
  {
    label: "Claude Code and Codex side by side, each in its own copy",
    lpm: true,
    iterm2: false,
    terminal: false,
    tmux: false,
    hyper: false,
    warp: false,
  },
  {
    label: "Project setup you edit inside the app",
    lpm: true,
    iterm2: false,
    terminal: false,
    tmux: false,
    hyper: false,
    warp: false,
  },
];

function Indicator({ on }: { on: boolean }) {
  return on ? (
    <>
      <Check
        aria-hidden="true"
        className="mx-auto w-4 h-4 text-gray-900 dark:text-white"
      />
      <span className="sr-only">Yes</span>
    </>
  ) : (
    <>
      <X
        aria-hidden="true"
        className="mx-auto w-4 h-4 text-gray-500 dark:text-gray-400"
      />
      <span className="sr-only">No</span>
    </>
  );
}

export default function Comparison() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-4xl mx-auto px-6">
        <SectionHeader
          eyebrow="How it compares"
          title="lpm vs iTerm2, Terminal.app, tmux, Hyper, and Warp"
          description="Every one of these renders text fast on Apple Silicon. These rows start with what the app itself costs and how it is built, then move to what it knows about the project you opened."
        />

        <div className="hidden sm:block rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50/60 dark:bg-white/[0.02] border-b border-gray-200 dark:border-gray-800">
                <th
                  scope="col"
                  className="text-left font-medium text-gray-500 dark:text-gray-400 px-5 py-4 w-2/5"
                >
                  Capability
                </th>
                {ALTERNATIVES.map((a) => (
                  <th
                    key={a.key}
                    scope="col"
                    className={`text-center font-semibold px-3 py-4 ${
                      a.key === "lpm"
                        ? "text-gray-900 dark:text-white bg-gray-100/70 dark:bg-white/[0.04]"
                        : "text-gray-500 dark:text-gray-400"
                    }`}
                  >
                    {a.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CAPABILITIES.map((cap, i) => (
                <tr
                  key={cap.label}
                  className={
                    i !== CAPABILITIES.length - 1
                      ? "border-b border-gray-200 dark:border-gray-800"
                      : ""
                  }
                >
                  <th
                    scope="row"
                    className="text-left font-normal text-gray-700 dark:text-gray-300 px-5 py-4"
                  >
                    {cap.label}
                  </th>
                  {ALTERNATIVES.map((a) => (
                    <td
                      key={a.key}
                      className={`px-3 py-4 ${
                        a.key === "lpm"
                          ? "bg-gray-100/70 dark:bg-white/[0.04]"
                          : ""
                      }`}
                    >
                      <Indicator on={cap[a.key]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="sm:hidden space-y-4">
          {ALTERNATIVES.map((a) => {
            const isLpm = a.key === "lpm";
            return (
              <div
                key={a.key}
                className={`rounded-2xl border p-5 ${
                  isLpm
                    ? "border-gray-300 dark:border-gray-700 bg-gray-50/60 dark:bg-white/[0.04]"
                    : "border-gray-200 dark:border-gray-800"
                }`}
              >
                <h3
                  className={`text-sm font-semibold mb-4 ${
                    isLpm
                      ? "text-gray-900 dark:text-white"
                      : "text-gray-700 dark:text-gray-300"
                  }`}
                >
                  {a.label}
                </h3>
                <ul className="space-y-3">
                  {CAPABILITIES.map((cap) => (
                    <li
                      key={cap.label}
                      className="flex items-start gap-3 text-sm"
                    >
                      <span className="mt-0.5 shrink-0">
                        <Indicator on={cap[a.key]} />
                      </span>
                      <span className="text-gray-600 dark:text-gray-400 leading-relaxed">
                        {cap.label}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
