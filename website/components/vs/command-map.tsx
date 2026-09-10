import type { ReactNode } from "react";
import { SectionHeader } from "@/components/section-header";

export type CommandMapRow = {
  from: string;
  to: string;
  note?: string;
};

type Props = {
  id?: string;
  eyebrow: string;
  title: string;
  description: ReactNode;
  fromLabel: string;
  toLabel: string;
  rows: CommandMapRow[];
  footnote?: ReactNode;
};

export function CommandMap({
  id,
  eyebrow,
  title,
  description,
  fromLabel,
  toLabel,
  rows,
  footnote,
}: Props) {
  return (
    <section
      {...(id ? { id } : {})}
      className={`py-16 sm:py-20 ${id ? "scroll-mt-20" : ""}`}
    >
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow={eyebrow}
          title={title}
          description={description}
        />

        <div className="hidden sm:block overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50/60 dark:bg-white/[0.02] border-b border-gray-200 dark:border-gray-800">
                <th
                  scope="col"
                  className="text-left font-medium text-gray-500 dark:text-gray-400 px-5 py-4"
                >
                  {fromLabel}
                </th>
                <th
                  scope="col"
                  className="text-left font-semibold text-gray-900 dark:text-white bg-gray-100/70 dark:bg-white/[0.04] px-5 py-4"
                >
                  {toLabel}
                </th>
                <th scope="col" className="px-5 py-4">
                  <span className="sr-only">Notes</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={`${row.from}-${row.to}`}
                  className={
                    i !== rows.length - 1
                      ? "border-b border-gray-200 dark:border-gray-800"
                      : ""
                  }
                >
                  <th
                    scope="row"
                    className="text-left font-normal align-top px-5 py-4"
                  >
                    <code className="font-mono text-xs text-gray-700 dark:text-gray-300">
                      {row.from}
                    </code>
                  </th>
                  <td className="align-top bg-gray-100/70 dark:bg-white/[0.04] px-5 py-4">
                    <code className="font-mono text-xs text-gray-900 dark:text-gray-100">
                      {row.to}
                    </code>
                  </td>
                  <td className="align-top px-5 py-4 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                    {row.note}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ul className="sm:hidden space-y-3">
          {rows.map((row) => (
            <li
              key={`${row.from}-${row.to}`}
              className="rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden"
            >
              <div className="border-b border-gray-200 dark:border-gray-800 bg-gray-50/60 dark:bg-white/[0.02] px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">
                  {fromLabel}
                </p>
                <div className="mt-1.5 overflow-x-auto">
                  <code className="block font-mono text-xs whitespace-pre text-gray-700 dark:text-gray-300">
                    {row.from}
                  </code>
                </div>
              </div>
              <div className="bg-gray-100/70 dark:bg-white/[0.04] px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">
                  {toLabel}
                </p>
                <div className="mt-1.5 overflow-x-auto">
                  <code className="block font-mono text-xs whitespace-pre text-gray-900 dark:text-gray-100">
                    {row.to}
                  </code>
                </div>
                {row.note && (
                  <p className="mt-2 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                    {row.note}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>

        {footnote && (
          <p className="mt-6 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
            {footnote}
          </p>
        )}
      </div>
    </section>
  );
}
