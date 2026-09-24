import { SectionHeader } from "@/components/section-header";
import ComparisonCell from "./comparison-cell";
import { COMPARISON_COLUMNS, COMPARISON_ROWS } from "./comparison-data";

const HIGHLIGHT_INDEX = COMPARISON_COLUMNS.length - 1;

const COLUMN_WIDTHS = ["md:w-[25%]", "md:w-[25%]", "md:w-[31%]"];

// Below md, display:block/grid drops native table semantics; the explicit roles restore them.
export default function Comparison() {
  return (
    <section id="comparison" className="pt-20 pb-6 sm:pt-24">
      <div className="max-w-5xl mx-auto px-6">
        <SectionHeader
          eyebrow="Side by side"
          title="Git worktree vs git clone vs lpm Duplicate"
          description="What gets copied, and what stays shared, row by row."
          className="mb-10 sm:mb-12"
        />

        <div className="relative overflow-clip rounded-2xl border border-gray-200 dark:border-gray-800">
          <table
            role="table"
            className="w-full text-left text-sm max-md:block md:table-fixed"
          >
            <caption className="sr-only">
              Git worktree, git clone and lpm Duplicate compared on ten
              properties
            </caption>
            <thead
              role="rowgroup"
              className="sticky top-14 z-10 bg-gray-50 shadow-[0_1px_0_0_var(--hairline)] max-md:block dark:bg-[#161616]"
            >
              <tr role="row" className="max-md:grid max-md:grid-cols-3">
                <th
                  scope="col"
                  role="columnheader"
                  className="px-5 py-4 max-md:sr-only md:w-[19%]"
                >
                  <span className="sr-only">Property</span>
                </th>
                {COMPARISON_COLUMNS.map((column, index) => {
                  const highlight = index === HIGHLIGHT_INDEX;
                  const Icon = column.icon;
                  return (
                    <th
                      key={column.name}
                      scope="col"
                      role="columnheader"
                      className={`px-3 py-3 align-bottom md:px-5 md:py-4 ${COLUMN_WIDTHS[index]} ${
                        highlight ? "bg-emerald-50 dark:bg-emerald-400/[0.07]" : ""
                      }`}
                    >
                      <span className="flex flex-col gap-1 md:flex-row md:items-center md:gap-2">
                        <Icon
                          aria-hidden
                          className={`h-4 w-4 shrink-0 ${column.iconTone}`}
                        />
                        <span
                          className={`text-xs font-semibold sm:text-[13px] ${
                            highlight
                              ? "text-emerald-800 dark:text-emerald-300"
                              : "text-gray-900 dark:text-gray-100"
                          }`}
                        >
                          {column.name}
                        </span>
                      </span>
                      <span className="mt-1 hidden text-[11px] font-medium uppercase tracking-widest text-gray-500 dark:text-gray-400 md:block">
                        {column.kind}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody role="rowgroup" className="max-md:block">
              {COMPARISON_ROWS.map((row, rowIndex) => (
                <tr
                  key={row.label}
                  role="row"
                  className={`max-md:grid max-md:grid-cols-3 ${
                    rowIndex < COMPARISON_ROWS.length - 1
                      ? "border-b border-gray-200 dark:border-gray-800"
                      : ""
                  }`}
                >
                  <th
                    scope="row"
                    role="rowheader"
                    className="px-5 py-4 align-top font-medium text-gray-900 dark:text-gray-100 max-md:col-span-3 max-md:bg-gray-50/70 max-md:px-3 max-md:py-2 max-md:text-[13px] max-md:font-semibold max-md:dark:bg-white/[0.025]"
                  >
                    {row.label}
                  </th>
                  {row.cells.map((cell, index) => (
                    <ComparisonCell
                      key={COMPARISON_COLUMNS[index].name}
                      cell={cell}
                      highlight={index === HIGHLIGHT_INDEX}
                    />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mx-auto mt-4 max-w-2xl text-center text-xs leading-relaxed text-gray-500 dark:text-gray-400">
          The lpm column assumes the project folder is the repository root. If
          the project is a subfolder of a larger repository, the copy is a
          plain folder next to it, inside that same repository, with no .git
          of its own.
        </p>
      </div>
    </section>
  );
}
