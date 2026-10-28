import { featureId } from "./feature-id";
import FeatureMeta from "./feature-meta";
import FeatureNote from "./feature-note";
import type { Highlight } from "./feature-types";
import KeyChips from "./key-chips";

type Props = { feature: Highlight; compact?: boolean; className?: string };

export default function HighlightCard({ feature, compact = false, className = "" }: Props) {
  const { icon: Icon, title, body, note, keys, scope, href, linkLabel } = feature;
  const icon = (
    <span
      className={`flex shrink-0 items-center justify-center rounded-xl bg-gray-900 text-white dark:bg-white dark:text-gray-900 ${
        compact ? "h-9 w-9" : "h-10 w-10"
      }`}
    >
      <Icon className={compact ? "h-4 w-4" : "h-[18px] w-[18px]"} aria-hidden />
    </span>
  );
  return (
    <li
      id={featureId(title)}
      className={`feature-target flex scroll-mt-40 rounded-2xl border border-gray-200 bg-white p-5 transition-colors duration-200 hover:border-gray-300 dark:border-gray-800 dark:bg-white/[0.025] dark:hover:border-gray-700 ${
        compact ? "gap-4" : "flex-col sm:p-6"
      } ${className}`}
    >
      {compact ? (
        icon
      ) : (
        <div className="flex items-start justify-between gap-3">
          {icon}
          {keys && <KeyChips keys={keys} />}
        </div>
      )}
      <div className={`flex min-w-0 flex-1 flex-col ${compact ? "" : "mt-5"}`}>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <h3 className="text-base font-semibold tracking-tight text-gray-900 dark:text-gray-100">
            {title}
          </h3>
          {compact && keys && <KeyChips keys={keys} />}
        </div>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-gray-600 dark:text-gray-400">
          {body}
        </p>
        {note && <FeatureNote text={note} />}
        {(scope || href) && (
          <div className={compact ? "pt-1" : "mt-auto pt-3"}>
            <FeatureMeta
              scope={scope}
              href={href}
              linkLabel={linkLabel}
              className={compact ? "" : "min-h-11"}
              stacked={!compact}
            />
          </div>
        )}
      </div>
    </li>
  );
}
