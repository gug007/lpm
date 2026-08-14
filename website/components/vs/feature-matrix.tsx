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
      <>
        <Minus
          aria-hidden="true"
          className="mx-auto w-4 h-4 text-gray-500 dark:text-gray-400"
        />
        <span className="sr-only">Partial</span>
      </>
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

        <div className="hidden md:block rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50/60 dark:bg-white/[0.02] border-b border-gray-200 dark:border-gray-800">
                <th
                  scope="col"
                  className="text-left font-medium text-gray-500 dark:text-gray-400 px-5 py-4 w-2/5 md:w-1/2"
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

        <ul className="md:hidden space-y-3">
          {rows.map((row) => (
            <li
              key={row.label}
              className="rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden"
            >
              <div className="border-b border-gray-200 dark:border-gray-800 bg-gray-50/60 dark:bg-white/[0.02] px-4 py-3 text-sm text-gray-700 dark:text-gray-300 leading-snug">
                {row.label}
              </div>
              <div className="grid grid-cols-2 divide-x divide-gray-200 dark:divide-gray-800">
                {columns.map((c) => (
                  <div
                    key={c.key}
                    className={`min-w-0 px-2.5 py-3 ${
                      c.key === "lpm"
                        ? "bg-gray-100/70 dark:bg-white/[0.04]"
                        : ""
                    }`}
                  >
                    <div
                      className={`mb-1.5 text-center text-[11px] font-semibold ${
                        c.key === "lpm"
                          ? "text-gray-900 dark:text-white"
                          : "text-gray-500 dark:text-gray-400"
                      }`}
                    >
                      {c.label}
                    </div>
                    <Cell value={row[c.key]} />
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
