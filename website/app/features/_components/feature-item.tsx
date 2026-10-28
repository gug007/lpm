import { featureId } from "./feature-id";
import FeatureMeta from "./feature-meta";
import FeatureNote from "./feature-note";
import type { Feature } from "./feature-types";
import KeyChips from "./key-chips";

type Props = { feature: Feature; className?: string };

export default function FeatureItem({ feature, className = "" }: Props) {
  const { title, body, note, keys, scope, href, linkLabel, mono } = feature;
  return (
    <li
      id={featureId(title)}
      className={`feature-target scroll-mt-40 border-t border-gray-200 pt-5 dark:border-gray-800 ${className}`}
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
        {keys && <KeyChips keys={keys} />}
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
        {body}
      </p>
      {note && <FeatureNote text={note} />}
      <FeatureMeta scope={scope} href={href} linkLabel={linkLabel} className="mt-2" />
    </li>
  );
}
