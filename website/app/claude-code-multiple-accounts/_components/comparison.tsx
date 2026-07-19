import { Check, X } from "lucide-react";
import { SectionHeader } from "@/components/section-header";

type Row = {
  label: string;
  lpm: boolean;
  switchers: boolean;
  manual: boolean;
  users: boolean;
};

const APPROACHES = [
  { key: "lpm", label: "lpm" },
  { key: "switchers", label: "Account switchers" },
  { key: "manual", label: "Manual CLAUDE_CONFIG_DIR" },
  { key: "users", label: "Separate macOS users" },
] as const;

const ROWS: Row[] = [
  {
    label: "Accounts run at the same time",
    lpm: true,
    switchers: false,
    manual: true,
    users: false,
  },
  {
    label: "Pinned per project, not per machine",
    lpm: true,
    switchers: false,
    manual: false,
    users: false,
  },
  {
    label: "Never copies or moves credentials",
    lpm: true,
    switchers: false,
    manual: true,
    users: true,
  },
  {
    label: "Settings, memory & skills shared across accounts",
    lpm: true,
    switchers: true,
    manual: false,
    users: false,
  },
  {
    label: "Running sessions keep their account when you switch",
    lpm: true,
    switchers: false,
    manual: true,
    users: true,
  },
  {
    label: "No per-terminal exports or scripts to remember",
    lpm: true,
    switchers: true,
    manual: false,
    users: true,
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
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="How it compares"
          title="Pinning vs. switching"
          description="Other setups can hold more than one Claude account — but each asks you to swap credentials, remember an env var, or leave the window. Pinning just points each project at its own account and leaves everything else alone."
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
                {APPROACHES.map((a) => (
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
              {ROWS.map((row, i) => (
                <tr
                  key={row.label}
                  className={
                    i !== ROWS.length - 1
                      ? "border-b border-gray-200 dark:border-gray-800"
                      : ""
                  }
                >
                  <th
                    scope="row"
                    className="text-left font-normal text-gray-700 dark:text-gray-300 px-5 py-4"
                  >
                    {row.label}
                  </th>
                  <td className="px-3 py-4 bg-gray-100/70 dark:bg-white/[0.04]">
                    <Indicator on={row.lpm} />
                  </td>
                  <td className="px-3 py-4">
                    <Indicator on={row.switchers} />
                  </td>
                  <td className="px-3 py-4">
                    <Indicator on={row.manual} />
                  </td>
                  <td className="px-3 py-4">
                    <Indicator on={row.users} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="sm:hidden space-y-4">
          {APPROACHES.map((a) => {
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
                  {ROWS.map((row) => (
                    <li
                      key={row.label}
                      className="flex items-start gap-3 text-sm"
                    >
                      <span className="mt-0.5 shrink-0">
                        <Indicator on={row[a.key]} />
                      </span>
                      <span className="text-gray-600 dark:text-gray-400 leading-relaxed">
                        {row.label}
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
