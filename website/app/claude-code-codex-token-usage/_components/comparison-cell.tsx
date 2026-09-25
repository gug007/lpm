import type { ComparisonCellValue } from "./comparison-data";
import VerdictIcon from "./verdict-icon";

const VERDICT_SPOKEN = { yes: "Supported", partial: "Partial", no: "Not supported" } as const;

export default function ComparisonCell({
  cell,
  columnName,
  highlight,
  rightInCard,
}: {
  cell: ComparisonCellValue;
  columnName: string;
  highlight: boolean;
  rightInCard: boolean;
}) {
  return (
    <td
      role="cell"
      className={`px-3 py-3 align-top max-md:border-t max-md:border-gray-200 max-md:dark:border-gray-800 md:px-3 md:py-4 lg:px-5 ${
        rightInCard ? "max-md:border-l" : ""
      } ${highlight ? "bg-emerald-50/40 dark:bg-emerald-400/[0.03]" : ""}`}
    >
      <span
        aria-hidden
        className={`mb-1.5 block text-[11px] font-semibold uppercase tracking-wide md:hidden ${
          highlight
            ? "text-emerald-700 dark:text-emerald-300"
            : "text-gray-500 dark:text-gray-400"
        }`}
      >
        {columnName}
      </span>
      <div className="flex gap-2 md:gap-2.5">
        <VerdictIcon verdict={cell.verdict} className="mt-[2px] h-3.5 w-3.5 sm:mt-[3px]" />
        <div className="min-w-0">
          <p
            className={`break-words text-xs font-medium leading-snug sm:text-[13px] ${
              highlight
                ? "text-gray-900 dark:text-gray-50"
                : "text-gray-800 dark:text-gray-200"
            }`}
          >
            {cell.verdict !== "neutral" && (
              <span className="sr-only">{`${VERDICT_SPOKEN[cell.verdict]}: `}</span>
            )}
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
