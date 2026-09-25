import { Fragment } from "react";
import { ArrowUpRight } from "lucide-react";
import {
  CHECK_ROWS,
  CHECK_TOOLS,
  type CheckCell,
} from "./check-usage-data";
import { INLINE_CODE, TEXT_LINK } from "./page-styles";

function withCode(text: string) {
  return text.split("`").map((part, i) =>
    i % 2 ? (
      <code key={i} className={INLINE_CODE}>
        {part}
      </code>
    ) : (
      part
    ),
  );
}

function breakAfterSlashes(text: string) {
  return text.split("/").map((part, i, parts) => (
    <Fragment key={i}>
      {part}
      {i < parts.length - 1 && (
        <>
          /<wbr />
        </>
      )}
    </Fragment>
  ));
}

function cellBody(cell: CheckCell) {
  if (cell.href) {
    return (
      <a
        href={cell.href}
        target="_blank"
        rel="noopener noreferrer"
        className={`${TEXT_LINK} break-words`}
      >
        {breakAfterSlashes(cell.text)}
        <ArrowUpRight
          className="ml-0.5 inline h-3 w-3 align-[-1px] text-gray-400 dark:text-gray-500"
          aria-hidden
        />
      </a>
    );
  }
  return (
    <>
      {cell.code && (
        <code className={`${INLINE_CODE} mb-1.5 inline-block`}>
          {cell.code}
        </code>
      )}
      <span className="block">{withCode(cell.text)}</span>
    </>
  );
}

export default function CheckUsageTable() {
  return (
    <div className="overflow-clip rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.02]">
      <table
        role="table"
        className="w-full text-left text-[13px] leading-snug max-sm:block sm:table-fixed"
      >
        <caption className="sr-only">
          Where to check usage in Claude Code and Codex
        </caption>
        <thead
          role="rowgroup"
          className="bg-gray-50 max-sm:sr-only dark:bg-white/[0.03]"
        >
          <tr role="row" className="border-b border-gray-200 dark:border-gray-800">
            <th scope="col" role="columnheader" className="w-[24%] px-4 py-3">
              <span className="sr-only">Where</span>
            </th>
            {CHECK_TOOLS.map((tool) => (
              <th
                key={tool.key}
                scope="col"
                role="columnheader"
                className="px-4 py-3 font-semibold text-gray-900 dark:text-gray-100"
              >
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: tool.dot }}
                  />
                  {tool.name}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody role="rowgroup" className="max-sm:block">
          {CHECK_ROWS.map((row, rowIndex) => (
            <tr
              key={row.label}
              role="row"
              className={`max-sm:grid max-sm:grid-cols-2 ${
                rowIndex < CHECK_ROWS.length - 1
                  ? "border-b border-gray-200 dark:border-gray-800"
                  : ""
              }`}
            >
              <th
                scope="row"
                role="rowheader"
                className="px-4 py-3 align-top font-medium text-gray-900 dark:text-gray-100 max-sm:col-span-2 max-sm:bg-gray-50/70 max-sm:px-3 max-sm:py-2 max-sm:font-semibold max-sm:dark:bg-white/[0.025]"
              >
                {row.label}
              </th>
              {CHECK_TOOLS.map((tool) => (
                <td
                  key={tool.key}
                  role="cell"
                  className="min-w-0 px-4 py-3 align-top text-gray-600 max-sm:px-3 dark:text-gray-400"
                >
                  <span
                    aria-hidden
                    className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 sm:hidden dark:text-gray-400"
                  >
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: tool.dot }}
                    />
                    {tool.name}
                  </span>
                  {cellBody(row[tool.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
