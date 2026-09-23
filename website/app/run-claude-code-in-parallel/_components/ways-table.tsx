import { WAY_COLUMNS, WAY_ROWS } from "./ways-data";

const SHARED = "Shared";

function cellTone(value: string): string {
  return value === SHARED
    ? "text-gray-500 dark:text-gray-400"
    : "text-gray-700 dark:text-gray-300";
}

export default function WaysTable() {
  return (
    <div className="mt-12">
      <h3 className="mb-4 text-center text-sm font-semibold text-gray-900 dark:text-gray-100">
        At a glance
      </h3>

      <div className="hidden overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800 md:block">
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">
            Tabs and splits, duplicates and Git worktrees compared
          </caption>
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50/80 dark:border-gray-800 dark:bg-white/[0.025]">
              <th scope="col" className="w-[26%] px-5 py-3.5">
                <span className="sr-only">Property</span>
              </th>
              {WAY_COLUMNS.map((column) => (
                <th
                  key={column}
                  scope="col"
                  className="px-5 py-3.5 text-[13px] font-semibold text-gray-900 dark:text-gray-100"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {WAY_ROWS.map((row, rowIndex) => (
              <tr
                key={row.label}
                className={
                  rowIndex < WAY_ROWS.length - 1
                    ? "border-b border-gray-100 dark:border-gray-800/80"
                    : ""
                }
              >
                <th
                  scope="row"
                  className="px-5 py-3 font-medium text-gray-800 dark:text-gray-200"
                >
                  {row.label}
                </th>
                {row.cells.map((cell, i) => (
                  <td key={WAY_COLUMNS[i]} className={`px-5 py-3 ${cellTone(cell)}`}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden">
        {WAY_ROWS.map((row) => {
          const same = row.cells.every((cell) => cell === row.cells[0]);
          return (
            <article
              key={row.label}
              className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800"
            >
              <h4 className="border-b border-gray-200 bg-gray-50/80 px-4 py-2.5 text-sm font-semibold text-gray-900 dark:border-gray-800 dark:bg-white/[0.025] dark:text-gray-100">
                {row.label}
              </h4>
              <dl className="divide-y divide-gray-100 dark:divide-gray-800">
                {same ? (
                  <div className="flex items-center justify-between gap-4 px-4 py-2.5">
                    <dt className="text-[12px] text-gray-500 dark:text-gray-400">
                      All three
                    </dt>
                    <dd className={`text-right text-[13px] ${cellTone(row.cells[0])}`}>
                      {row.cells[0]}
                    </dd>
                  </div>
                ) : (
                  row.cells.map((cell, i) => (
                    <div
                      key={WAY_COLUMNS[i]}
                      className="flex items-center justify-between gap-4 px-4 py-2.5"
                    >
                      <dt className="shrink-0 text-[12px] text-gray-500 dark:text-gray-400">
                        {WAY_COLUMNS[i]}
                      </dt>
                      <dd className={`text-right text-[13px] ${cellTone(cell)}`}>
                        {cell}
                      </dd>
                    </div>
                  ))
                )}
              </dl>
            </article>
          );
        })}
      </div>

      <p className="mt-4 text-center text-xs leading-relaxed text-gray-500 dark:text-gray-400">
        None of the three gives an agent its own ports, database or Docker —
        more on that under{" "}
        <a
          href="#limits"
          className="underline decoration-gray-300 underline-offset-4 hover:text-gray-900 dark:decoration-gray-600 dark:hover:text-white"
        >
          honest limits
        </a>
        .
      </p>
    </div>
  );
}
