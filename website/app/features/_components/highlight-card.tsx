import FeatureMeta from "./feature-meta";
import FeatureNote from "./feature-note";
import type { Highlight } from "./feature-types";
import KeyChips from "./key-chips";

type Props = { feature: Highlight; className?: string };

export default function HighlightCard({ feature, className = "" }: Props) {
  const { icon: Icon, title, body, note, keys, scope, href, linkLabel } = feature;
  return (
    <li
      className={`flex flex-col rounded-2xl border border-gray-200 bg-white p-5 shadow-sm shadow-gray-900/[0.03] sm:p-6 dark:border-gray-800 dark:bg-white/[0.03] dark:shadow-none ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-gray-800 ring-1 ring-gray-200/80 dark:bg-white/[0.06] dark:text-gray-200 dark:ring-white/[0.08]">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        {keys && <KeyChips keys={keys} />}
      </div>
      <h3 className="mt-5 text-base font-semibold tracking-tight text-gray-900 dark:text-gray-100">
        {title}
      </h3>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-gray-600 dark:text-gray-400">
        {body}
      </p>
      {note && <FeatureNote text={note} />}
      {(scope || href) && (
        <div className="mt-auto pt-3">
          <FeatureMeta
            scope={scope}
            href={href}
            linkLabel={linkLabel}
            className="min-h-11"
            stacked
          />
        </div>
      )}
    </li>
  );
}
