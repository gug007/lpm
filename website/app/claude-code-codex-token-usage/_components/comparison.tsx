import { SectionHeader } from "@/components/section-header";
import ComparisonCell from "./comparison-cell";
import { COLUMNS, HIGHLIGHT_COLUMN, ROWS } from "./comparison-data";
import ComparisonPicks from "./comparison-picks";

const COLUMN_WIDTHS = ["md:w-[20%]", "md:w-[20%]", "md:w-[20%]", "md:w-[24%]"];

// Below md, display:block/grid drops native table semantics; the explicit roles restore them.
export default function Comparison() {
  return (
    <section id="compare" className="pt-20 pb-6 sm:pt-24">
      <div className="max-w-6xl mx-auto px-6">
        <SectionHeader
          eyebrow="Side by side"
          title="Claude Code and Codex usage trackers compared"
          description="The built-in commands, ccusage, CodexBar and lpm, row by row. Each is best at something."
          className="mb-10 sm:mb-12"
        />

        <div className="relative md:overflow-clip md:rounded-2xl md:border md:border-gray-200 md:dark:border-gray-800">
          <table
            role="table"
            className="w-full text-left text-sm max-md:block md:table-fixed"
          >
            <caption className="sr-only">
              The built-in commands, ccusage, CodexBar and lpm compared on
              eight properties
            </caption>
            <thead
              role="rowgroup"
              className="max-md:sr-only md:sticky md:top-14 md:z-10 md:bg-gray-50 md:shadow-[0_1px_0_0_var(--hairline)] md:dark:bg-[#161616]"
            >
              <tr role="row">
                <th
                  scope="col"
                  role="columnheader"
                  className="px-5 py-4 md:w-[16%]"
                >
                  <span className="sr-only">Property</span>
                </th>
                {COLUMNS.map((column, index) => {
                  const highlight = column.id === HIGHLIGHT_COLUMN;
                  const Icon = column.icon;
                  return (
                    <th
                      key={column.id}
                      scope="col"
                      role="columnheader"
                      className={`px-3 py-4 align-bottom lg:px-5 ${COLUMN_WIDTHS[index]} ${
                        highlight ? "bg-emerald-50 dark:bg-emerald-400/[0.07]" : ""
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <Icon
                          aria-hidden
                          className={`h-4 w-4 shrink-0 ${column.iconTone}`}
                        />
                        <span
                          className={`text-[13px] font-semibold ${
                            highlight
                              ? "text-emerald-800 dark:text-emerald-300"
                              : "text-gray-900 dark:text-gray-100"
                          }`}
                        >
                          {column.name}
                        </span>
                      </span>
                      <span className="mt-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                        {column.kind}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody role="rowgroup" className="max-md:block max-md:space-y-3">
              {ROWS.map((row, rowIndex) => (
                <tr
                  key={row.label}
                  role="row"
                  className={`max-md:grid max-md:grid-cols-2 max-md:overflow-hidden max-md:rounded-xl max-md:border max-md:border-gray-200 max-md:dark:border-gray-800 ${
                    rowIndex < ROWS.length - 1
                      ? "md:border-b md:border-gray-200 md:dark:border-gray-800"
                      : ""
                  }`}
                >
                  <th
                    scope="row"
                    role="rowheader"
                    className="px-5 py-4 align-top font-medium text-gray-900 dark:text-gray-100 max-md:col-span-2 max-md:bg-gray-50/70 max-md:px-3 max-md:py-2.5 max-md:text-[13px] max-md:font-semibold max-md:dark:bg-white/[0.025] md:px-3 lg:px-5"
                  >
                    {row.label}
                  </th>
                  {COLUMNS.map((column, index) => (
                    <ComparisonCell
                      key={column.id}
                      cell={row.cells[column.id]}
                      columnName={column.name}
                      highlight={column.id === HIGHLIGHT_COLUMN}
                      rightInCard={index % 2 === 1}
                    />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mx-auto mt-4 max-w-2xl text-center text-xs leading-relaxed text-gray-500 dark:text-gray-400">
          Claude-Code-Usage-Monitor (Claude Code only) runs a live terminal
          dashboard with pace, burn-rate forecasts and warnings, and can read
          Claude Code&apos;s official 5-hour and weekly percentages through its
          statusline hook. The provider dashboards,
          claude.ai Settings &gt; Usage and chatgpt.com/codex/settings/usage,
          show your limits with no tool at all.
        </p>

        <ComparisonPicks />
      </div>
    </section>
  );
}
