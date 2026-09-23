import { Check, Minus, X } from "lucide-react";
import { ALTERNATIVES, CAPABILITIES } from "./comparison-data";

export function ComparisonMobile() {
  return (
    <ul className="sm:hidden divide-y divide-gray-200 dark:divide-gray-800 rounded-2xl border border-gray-200 dark:border-gray-800">
      {CAPABILITIES.map((cap) => (
        <li key={cap.label} className="p-4">
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 leading-snug">
            {cap.label}
          </h3>
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {ALTERNATIVES.map((a) => {
              const value = cap[a.key];
              const partial = typeof value === "string";
              const Icon = partial ? Minus : value ? Check : X;
              const tone =
                value === true
                  ? a.key === "lpm"
                    ? "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900"
                    : "border-gray-300 text-gray-800 dark:border-gray-600 dark:text-gray-200"
                  : partial
                    ? "border-gray-300 text-gray-700 dark:border-gray-700 dark:text-gray-300"
                    : "border-gray-200 text-gray-500 dark:border-gray-800 dark:text-gray-400";
              return (
                <li
                  key={a.key}
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${tone}`}
                >
                  <Icon aria-hidden="true" className="h-3 w-3 shrink-0" />
                  {a.label}
                  {partial ? (
                    <span className="text-gray-500 dark:text-gray-400">
                      · {value}
                    </span>
                  ) : (
                    <span className="sr-only">{value ? ": yes" : ": no"}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ul>
  );
}
