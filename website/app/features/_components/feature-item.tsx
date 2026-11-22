import { featureId } from "./feature-id";
import FeatureLinkButton from "./feature-link-button";
import FeatureMeta from "./feature-meta";
import FeatureNote from "./feature-note";
import type { Feature } from "./feature-types";
import KeyChips from "./key-chips";

type Props = { feature: Feature; className?: string };

export default function FeatureItem({ feature, className = "" }: Props) {
  const { title, body, note, keys, scope, href, linkLabel, mono, since } = feature;
  return (
    <li
      id={featureId(title)}
      className={`feature-target group scroll-mt-40 border-t border-gray-200 pt-5 dark:border-gray-800 ${className}`}
    >
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <h4
          className={
            mono
              ? "font-mono text-[13px] font-semibold text-gray-900 dark:text-gray-100"
              : "text-sm font-semibold text-gray-900 dark:text-gray-100"
          }
        >
          {title}
        </h4>
        {since && (
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-px font-mono text-[11px] text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
            since v{since}
          </span>
        )}
        {keys && <KeyChips keys={keys} />}
        <FeatureLinkButton title={title} />
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
        {body}
      </p>
      {note && <FeatureNote text={note} />}
      <FeatureMeta scope={scope} href={href} linkLabel={linkLabel} className="mt-2" />
    </li>
  );
}
