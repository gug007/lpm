import { Check, X } from "lucide-react";
import { SectionHeader } from "@/components/section-header";
import { ALTERNATIVES, CAPABILITIES, type Cell } from "./comparison-data";
import { ComparisonMobile } from "./comparison-mobile";

function Indicator({ value }: { value: Cell }) {
  if (typeof value === "string") {
    return (
      <span className="block text-center text-xs leading-snug text-gray-600 dark:text-gray-400">
        {value}
      </span>
    );
  }
  return value ? (
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
          title="A full stack in lpm vs VS Code, iTerm2, tmux and Warp"
          description="How each one starts your services, shows their logs and ports, and reaches a remote box, and how much of that you script yourself."
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
                      <Indicator value={cap[a.key]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ComparisonMobile />
      </div>
    </section>
  );
}
