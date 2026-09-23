import Link from "next/link";
import { ArrowRight, Check, X } from "lucide-react";
import { SectionHeader } from "@/components/section-header";
import { vsPath } from "@/lib/links";

type Capability = {
  label: string;
  lpm: boolean;
  tabs: boolean;
  tmux: boolean;
  editor: boolean;
};

const ALTERNATIVES = [
  { key: "lpm", label: "lpm desktop" },
  { key: "tabs", label: "Terminal tabs" },
  { key: "tmux", label: "tmux / screen" },
  { key: "editor", label: "Editor window" },
] as const;

const CAPABILITIES: Capability[] = [
  {
    label: "Start full stack in one command",
    lpm: true,
    tabs: false,
    tmux: true,
    editor: false,
  },
  {
    label: "Live output per service",
    lpm: true,
    tabs: true,
    tmux: true,
    editor: false,
  },
  {
    label: "One window for every running service",
    lpm: true,
    tabs: false,
    tmux: true,
    editor: false,
  },
  {
    label: "Run several agents, each in its own copy of the repo",
    lpm: true,
    tabs: false,
    tmux: false,
    editor: false,
  },
  {
    label: "Visual project switcher with live state",
    lpm: true,
    tabs: false,
    tmux: false,
    editor: false,
  },
  {
    label: "Native macOS app with dark mode",
    lpm: true,
    tabs: true,
    tmux: false,
    editor: true,
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
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="How it compares"
          title="A desktop workspace, not another terminal"
          description="lpm gives every running service and every agent its own pane in one native window, with each agent's state in the sidebar."
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
                  <td className="px-3 py-4 bg-gray-100/70 dark:bg-white/[0.04]">
                    <Indicator on={cap.lpm} />
                  </td>
                  <td className="px-3 py-4">
                    <Indicator on={cap.tabs} />
                  </td>
                  <td className="px-3 py-4">
                    <Indicator on={cap.tmux} />
                  </td>
                  <td className="px-3 py-4">
                    <Indicator on={cap.editor} />
                  </td>
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

        <Link
          href={vsPath("cmux")}
          className="group mt-6 block rounded-2xl border border-gray-200 dark:border-gray-800 p-6 hover:border-gray-300 dark:hover:border-gray-700 hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition-colors duration-200"
        >
          <h3 className="text-sm font-semibold mb-1.5 inline-flex items-center gap-1.5 text-gray-900 dark:text-gray-100">
            lpm vs cmux
            <ArrowRight
              className="w-3.5 h-3.5 opacity-0 -translate-x-1 group-hover:opacity-70 group-hover:translate-x-0 transition-all duration-200"
              aria-hidden
            />
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
            cmux is a Mac terminal built around agent sessions. Compare the two
            row by row: what each one configures, and which of them starts the
            services your agents need.
          </p>
        </Link>
      </div>
    </section>
  );
}
