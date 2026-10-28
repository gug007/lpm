import type { ReactNode } from "react";
import type { AreaMeta } from "./areas";
import type { AreaVisualSpec } from "./area-visuals";
import AreaVisual from "./area-visual";
import FeatureList from "./feature-list";
import type { FeatureArea } from "./feature-types";
import HighlightCard from "./highlight-card";

type Props = {
  area: FeatureArea;
  meta: AreaMeta;
  tinted: boolean;
  visual?: AreaVisualSpec;
  children?: ReactNode;
};

export default function AreaSection({ area, meta, tinted, visual, children }: Props) {
  const Icon = meta.icon;
  const split = visual?.layout === "split";
  const lastIndex = area.highlights.length - 1;
  const highlights = area.highlights.map((feature, index) => (
    <HighlightCard
      key={feature.title}
      feature={feature}
      compact={split}
      className={
        !split && index === lastIndex && index % 2 === 0
          ? "sm:col-span-2 lg:col-span-1"
          : ""
      }
    />
  ));

  return (
    <section
      id={area.id}
      aria-labelledby={`${area.id}-title`}
      className={`scroll-mt-28 border-t border-gray-200 py-16 sm:py-24 dark:border-gray-800 ${
        tinted ? "bg-gray-50/70 dark:bg-white/[0.015]" : ""
      }`}
    >
      <div className="mx-auto max-w-6xl px-6">
        <header className="grid gap-x-16 gap-y-4 lg:grid-cols-2 lg:items-end">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-gray-500 dark:text-gray-400">
              <Icon className="h-4 w-4" aria-hidden />
              {meta.eyebrow}
            </p>
            <h2
              id={`${area.id}-title`}
              className="mt-3 text-balance text-[1.75rem] font-bold leading-[1.15] tracking-tight text-gray-900 sm:text-4xl dark:text-white"
            >
              {area.title}
            </h2>
          </div>
          <p className="max-w-xl text-pretty text-base leading-relaxed text-gray-600 sm:text-[17px] dark:text-gray-400">
            {area.description}
          </p>
        </header>

        {split && visual ? (
          <div className="mt-12 grid items-start gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-12">
            <AreaVisual caption={visual.caption} className="lg:sticky lg:top-36 lg:order-last">
              {visual.node}
            </AreaVisual>
            <ul className="grid gap-3">{highlights}</ul>
          </div>
        ) : (
          <>
            {visual && (
              <AreaVisual caption={visual.caption} className="mt-12">
                {visual.node}
              </AreaVisual>
            )}
            {children}
            <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{highlights}</ul>
          </>
        )}

        <div className="mt-16 flex items-center gap-4">
          <h3 className="shrink-0 text-sm font-semibold text-gray-900 dark:text-gray-100">
            More in {meta.label}
          </h3>
          <span aria-hidden className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
          <span className="shrink-0 text-xs tabular-nums text-gray-500 dark:text-gray-400">
            {area.features.length} features
          </span>
        </div>
        <FeatureList id={area.id} label={meta.label} features={area.features} />
      </div>
    </section>
  );
}
