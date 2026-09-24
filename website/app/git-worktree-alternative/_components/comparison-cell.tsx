import type { ComparisonCellValue } from "./comparison-data";
import VerdictIcon from "./verdict-icon";

export default function ComparisonCell({
  cell,
  highlight,
}: {
  cell: ComparisonCellValue;
  highlight: boolean;
}) {
  return (
    <td
      role="cell"
      className={`px-3 py-3 align-top md:px-5 md:py-4 ${
        highlight ? "bg-emerald-50/40 dark:bg-emerald-400/[0.03]" : ""
      }`}
    >
      <div className="flex flex-col gap-1.5 md:flex-row md:gap-2.5">
        <VerdictIcon verdict={cell.verdict} className="h-3.5 w-3.5 md:mt-[3px]" />
        <div className="min-w-0">
          <p
            className={`break-words text-xs font-medium leading-snug sm:text-[13px] ${
              highlight
                ? "text-gray-900 dark:text-gray-50"
                : "text-gray-800 dark:text-gray-200"
            }`}
          >
            {cell.mono === "value" ? (
              <code className="font-mono text-[0.95em]">{cell.value}</code>
            ) : (
              cell.value
            )}
          </p>
          {cell.detail && (
            <p className="mt-1 break-words text-[11px] leading-snug text-gray-500 dark:text-gray-400 sm:text-xs">
              {cell.mono === "detail" ? (
                <code className="font-mono">{cell.detail}</code>
              ) : (
                cell.detail
              )}
            </p>
          )}
        </div>
      </div>
    </td>
  );
}
