import type { ReactNode } from "react";
import { Check, Minus, X } from "lucide-react";
import { SectionHeader } from "@/components/section-header";

export type MatrixCell = boolean | "partial" | string;

export type MatrixRow = {
  label: string;
  lpm: MatrixCell;
  competitor: MatrixCell;
};

type Props = {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  competitorName: string;
  rows: MatrixRow[];
};

function Cell({ value }: { value: MatrixCell }) {
  if (value === "partial") {
    return (
      <Minus
        aria-label="Partial"
        className="mx-auto w-4 h-4 text-gray-400 dark:text-gray-500"
      />
    );
  }
  if (typeof value === "string") {
    return (
      <span className="block text-center text-xs text-gray-600 dark:text-gray-400 leading-snug">
        {value}
      </span>
    );
  }
  return value ? (
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

export function FeatureMatrix({
  eyebrow = "How it compares",
  title,
  description,
  competitorName,
  rows,
}: Props) {
  const columns = [
    { key: "lpm", label: "lpm" },
    { key: "competitor", label: competitorName },
  ] as const;

  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow={eyebrow}
          title={title}
          description={description}
        />

        <div className="hidden sm:block rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50/60 dark:bg-white/[0.02] border-b border-gray-200 dark:border-gray-800">
                <th
                  scope="col"
                  className="text-left font-medium text-gray-500 dark:text-gray-400 px-5 py-4 w-1/2"
                >
                  Capability
                </th>
                {columns.map((c) => (
                  <th
                    key={c.key}
                    scope="col"
                    className={`text-center font-semibold px-3 py-4 ${
                      c.key === "lpm"
                        ? "text-gray-900 dark:text-white bg-gray-100/70 dark:bg-white/[0.04]"
                        : "text-gray-500 dark:text-gray-400"
                    }`}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={row.label}
                  className={
                    i !== rows.length - 1
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
                  <td className="px-3 py-4 bg-gray-100/70 dark:bg-white/[0.04] align-middle">
                    <Cell value={row.lpm} />
                  </td>
                  <td className="px-3 py-4 align-middle">
                    <Cell value={row.competitor} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="sm:hidden space-y-4">
          {columns.map((c) => {
            const isLpm = c.key === "lpm";
            return (
              <div
                key={c.key}
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
                  {c.label}
                </h3>
                <ul className="space-y-3">
                  {rows.map((row) => (
                    <li
                      key={row.label}
                      className="flex items-start gap-3 text-sm"
                    >
                      <span className="mt-0.5 shrink-0">
                        <Cell value={row[c.key]} />
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
