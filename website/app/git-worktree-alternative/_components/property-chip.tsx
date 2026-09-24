import type { Chip, ChipVerdict } from "./alternatives-data";
import VerdictIcon from "./verdict-icon";

const STYLES: Record<ChipVerdict, string> = {
  yes: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800/70 dark:bg-emerald-400/10 dark:text-emerald-100",
  partial:
    "border-dashed border-amber-300 bg-white/60 text-gray-700 dark:border-amber-400/40 dark:bg-transparent dark:text-gray-300",
  no: "border-gray-200 bg-transparent text-gray-500 dark:border-gray-800 dark:text-gray-400",
};

const WORDS: Record<ChipVerdict, string> = {
  yes: "yes",
  partial: "partly",
  no: "no",
};

export default function PropertyChip({
  label,
  chip,
}: {
  label: string;
  chip: Chip;
}) {
  return (
    <li
      className={`relative grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-1 rounded-lg border px-1.5 py-1.5 text-[11px] leading-snug sm:inline-flex sm:items-center sm:gap-x-1.5 sm:rounded-full sm:px-2.5 sm:py-1 sm:text-xs sm:leading-tight ${STYLES[chip.verdict]}`}
    >
      <VerdictIcon verdict={chip.verdict} className="mt-0.5 h-3 w-3 sm:mt-0" />
      <span>
        {label}
        <span className="sr-only">: {WORDS[chip.verdict]}</span>
      </span>
      {chip.note && (
        <span className="col-start-2 text-gray-500 dark:text-gray-400">
          <span className="hidden sm:inline">· </span>
          {chip.note}
        </span>
      )}
    </li>
  );
}
