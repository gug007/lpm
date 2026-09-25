import { COLUMNS, HIGHLIGHT_COLUMN, PICKS } from "./comparison-data";

export default function ComparisonPicks() {
  return (
    <div className="mx-auto mt-10 max-w-3xl">
      <h3 className="text-center text-lg font-semibold text-gray-900 dark:text-gray-100">
        Which one should you use?
      </h3>
      <ul className="mt-5 grid gap-3 sm:grid-cols-2">
        {COLUMNS.map((column) => {
          const Icon = column.icon;
          const pick = PICKS[column.id];
          const highlight = column.id === HIGHLIGHT_COLUMN;
          return (
            <li
              key={column.id}
              className={`flex gap-3 rounded-xl border p-4 text-sm leading-relaxed ${
                highlight
                  ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-400/20 dark:bg-emerald-400/[0.04]"
                  : "border-gray-200 dark:border-gray-800"
              }`}
            >
              <Icon
                aria-hidden
                className={`mt-0.5 h-4 w-4 shrink-0 ${column.iconTone}`}
              />
              <p className="text-gray-600 dark:text-gray-300">
                <strong className="font-semibold text-gray-900 dark:text-gray-100">
                  {pick.lead}
                </strong>
                , {pick.text}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
