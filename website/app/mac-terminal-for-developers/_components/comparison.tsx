import { Check, X } from "lucide-react";
import { SectionHeader } from "@/components/section-header";

type AlternativeKey = "lpm" | "iterm2" | "terminal" | "tmux" | "warp" | "vsCode";

type Capability = {
  label: string;
} & Record<AlternativeKey, boolean>;

const ALTERNATIVES: { key: AlternativeKey; label: string }[] = [
  { key: "lpm", label: "lpm" },
  { key: "iterm2", label: "iTerm2" },
  { key: "terminal", label: "Terminal.app" },
  { key: "tmux", label: "tmux" },
  { key: "warp", label: "Warp" },
  { key: "vsCode", label: "VS Code terminal" },
];

const CAPABILITIES: Capability[] = [
  {
    label: "Native Apple Silicon app (no Electron)",
    lpm: true,
    iterm2: true,
    terminal: true,
    tmux: true,
    warp: true,
    vsCode: false,
  },
  {
    label: "Per-project persistent workspace with live state",
    lpm: true,
    iterm2: false,
    terminal: false,
    tmux: false,
    warp: false,
    vsCode: false,
  },
  {
    label: "Start your full dev stack in one command",
    lpm: true,
    iterm2: false,
    terminal: false,
    tmux: true,
    warp: false,
    vsCode: false,
  },
  {
    label: "Isolated per-service log pane",
    lpm: true,
    iterm2: false,
    terminal: false,
    tmux: true,
    warp: false,
    vsCode: false,
  },
  {
    label: "Auto-detects Rails, Next.js, Go, Django, Flask, Docker Compose",
    lpm: true,
    iterm2: false,
    terminal: false,
    tmux: false,
    warp: false,
    vsCode: false,
  },
  {
    label: "Run multiple AI agents on the same codebase without conflicts",
    lpm: true,
    iterm2: false,
    terminal: false,
    tmux: false,
    warp: false,
    vsCode: false,
  },
  {
    label: "Switch between projects without restarting services",
    lpm: true,
    iterm2: false,
    terminal: false,
    tmux: false,
    warp: false,
    vsCode: false,
  },
  {
    label: "Built-in config editor for your project's services",
    lpm: true,
    iterm2: false,
    terminal: false,
    tmux: false,
    warp: false,
    vsCode: false,
  },
  {
    label: "Free and open source",
    lpm: true,
    iterm2: true,
    terminal: true,
    tmux: true,
    warp: false,
    vsCode: false,
  },
];

function Indicator({ on }: { on: boolean }) {
  return on ? (
    <Check
      aria-label="Yes"
      className="mx-auto w-4 h-4 text-gray-900 dark:text-white"
    />
  ) : (
    <X
      aria-label="No"
      className="mx-auto w-4 h-4 text-gray-300 dark:text-gray-600"
    />
  );
}

export default function Comparison() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-4xl mx-auto px-6">
        <SectionHeader
          eyebrow="How it compares"
          title="lpm vs iTerm2, Terminal.app, tmux, Warp, and VS Code terminal"
          description="A capability matrix for Mac developers choosing between the tools already on their machine."
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
