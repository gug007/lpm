import { CHECKED, EXPLAINERS } from "./limits-data";
import { TEXT_LINK } from "./page-styles";

export default function LimitsExplainer() {
  return (
    <div className="mx-auto mt-14 max-w-5xl">
      <div className="grid gap-6 md:grid-cols-2">
        {EXPLAINERS.map(({ dot, title, items, source }) => (
          <article
            key={title}
            className="flex flex-col rounded-2xl border border-gray-200 p-6 dark:border-gray-800"
          >
            <h3 className="flex items-center gap-2.5 font-semibold text-gray-900 dark:text-gray-100">
              <span
                aria-hidden
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: dot }}
              />
              {title}
            </h3>
            <ul className="mt-4 flex-1 list-disc space-y-2.5 pl-5 text-sm leading-relaxed text-gray-600 marker:text-gray-300 dark:text-gray-400 dark:marker:text-gray-600">
              {items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="mt-3 text-sm sm:mt-5">
              <a
                href={source.href}
                target="_blank"
                rel="noopener noreferrer"
                className={`${TEXT_LINK} inline-flex min-h-11 items-center sm:min-h-0`}
              >
                {source.label}
                <span aria-hidden> ↗</span>
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </p>
          </article>
        ))}
      </div>
      <p className="mt-4 text-center text-xs text-gray-500 dark:text-gray-400">
        Checked <time dateTime={CHECKED.iso}>{CHECKED.label}</time>. Allowances
        change; the linked pages have the current rules.
      </p>
    </div>
  );
}
