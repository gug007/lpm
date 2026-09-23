import type { ReactNode } from "react";
import { Check, X } from "lucide-react";
import { SectionHeader } from "@/components/section-header";
import { TOOL_COLUMNS, TOOL_ROWS, type ToolCell } from "./tool-matrix-data";

const HIGHLIGHT = "bg-gray-100/70 dark:bg-white/[0.04]";
const STICKY =
  "sticky left-0 z-10 bg-background shadow-[1px_0_0_0_var(--hairline)]";

// The wrapper is positioned so the absolutely positioned `sr-only` label
// resolves against the cell rather than the page: this table is wider than the
// viewport, and a label whose containing block is the page escapes the scroller
// and stretches the document with it.
function Cell({ value }: { value: ToolCell }) {
  if (typeof value === "string") {
    return (
      <span className="block text-center text-xs text-gray-600 dark:text-gray-400 leading-snug">
        {value}
      </span>
    );
  }
  return value ? (
    <span className="relative block">
      <Check
        aria-hidden="true"
        className="mx-auto w-4 h-4 text-gray-900 dark:text-white"
      />
      <span className="sr-only">Yes</span>
    </span>
  ) : (
    <span className="relative block">
      <X
        aria-hidden="true"
        className="mx-auto w-4 h-4 text-gray-500 dark:text-gray-400"
      />
      <span className="sr-only">No</span>
    </span>
  );
}

function PhoneCell({ value }: { value: ToolCell }) {
  if (typeof value === "string") {
    return (
      <span className="text-xs leading-snug text-gray-600 dark:text-gray-400">
        {value}
      </span>
    );
  }
  return value ? (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-900 dark:text-white">
      <Check aria-hidden="true" className="h-3.5 w-3.5" />
      Yes
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
      <X aria-hidden="true" className="h-3.5 w-3.5" />
      No
    </span>
  );
}

export default function ToolMatrix({ footnote }: { footnote?: ReactNode }) {
  return (
    <section id="matrix" className="py-16 sm:py-20 scroll-mt-20">
      <div className="max-w-6xl mx-auto px-6">
        <SectionHeader
          eyebrow="Every tool, side by side"
          title="The capabilities that actually differ"
          description="Thirteen rows, each one a place where the eight columns genuinely differ. Two of them go against lpm."
        />

        <div className="hidden md:block rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[60rem] text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800">
                  <th
                    scope="col"
                    className={`${STICKY} min-w-[12rem] sm:min-w-[14rem] text-left font-medium text-gray-500 dark:text-gray-400 px-5 py-4`}
                  >
                    Capability
                  </th>
                  {TOOL_COLUMNS.map((column) => (
                    <th
                      key={column.key}
                      scope="col"
                      className={`px-3 py-4 text-center text-xs font-semibold ${
                        column.key === "lpm"
                          ? `text-gray-900 dark:text-white ${HIGHLIGHT}`
                          : "text-gray-500 dark:text-gray-400"
                      }`}
                    >
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TOOL_ROWS.map((row, index) => (
                  <tr
                    key={row.label}
                    className={
                      index !== TOOL_ROWS.length - 1
                        ? "border-b border-gray-200 dark:border-gray-800"
                        : ""
                    }
                  >
                    <th
                      scope="row"
                      className={`${STICKY} text-left font-normal text-gray-700 dark:text-gray-300 px-5 py-4 align-middle leading-snug`}
                    >
                      {row.label}
                    </th>
                    {TOOL_COLUMNS.map((column) => (
                      <td
                        key={column.key}
                        className={`px-3 py-4 align-middle ${
                          column.key === "lpm" ? HIGHLIGHT : ""
                        }`}
                      >
                        <Cell value={row[column.key]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <ul className="space-y-3 md:hidden">
          {TOOL_ROWS.map((row) => (
            <li
              key={row.label}
              className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800"
            >
              <div className="border-b border-gray-200 bg-gray-50/60 px-4 py-3 text-sm leading-snug text-gray-700 dark:border-gray-800 dark:bg-white/[0.02] dark:text-gray-300">
                {row.label}
              </div>
              <dl className="divide-y divide-gray-100 dark:divide-gray-800">
                {TOOL_COLUMNS.map((column) => (
                  <div
                    key={column.key}
                    className={`flex items-center justify-between gap-4 px-4 py-2.5 ${
                      column.key === "lpm" ? HIGHLIGHT : ""
                    }`}
                  >
                    <dt
                      className={`shrink-0 text-[12px] ${
                        column.key === "lpm"
                          ? "font-semibold text-gray-900 dark:text-white"
                          : "text-gray-500 dark:text-gray-400"
                      }`}
                    >
                      {column.label}
                    </dt>
                    <dd className="min-w-0 text-right">
                      <PhoneCell value={row[column.key]} />
                    </dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>

        {footnote && (
          <p className="mt-6 text-sm leading-relaxed text-gray-500 dark:text-gray-400 [&_code]:font-mono [&_code]:text-xs">
            {footnote}
          </p>
        )}
      </div>
    </section>
  );
}
