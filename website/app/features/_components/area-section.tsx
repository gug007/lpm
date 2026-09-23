import type { ReactNode } from "react";
import { SectionHeader } from "@/components/section-header";
import type { AreaMeta } from "./areas";
import FeatureList from "./feature-list";
import type { FeatureArea } from "./feature-types";
import HighlightCard from "./highlight-card";

type Props = {
  area: FeatureArea;
  meta: AreaMeta;
  tinted: boolean;
  visual?: ReactNode;
  children?: ReactNode;
};

export default function AreaSection({ area, meta, tinted, visual, children }: Props) {
  const Icon = meta.icon;
  const lastIndex = area.highlights.length - 1;
  return (
    <section
      id={area.id}
      className={`scroll-mt-10 border-t border-gray-200 py-16 sm:py-20 dark:border-gray-800 ${
        tinted ? "bg-gray-50/70 dark:bg-white/[0.015]" : ""
      }`}
    >
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeader
          className="mb-10"
          eyebrow={
            <span className="inline-flex items-center gap-1.5">
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {meta.eyebrow}
            </span>
          }
          title={area.title}
          description={area.description}
        />
        {visual}
        {children}
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {area.highlights.map((feature, index) => (
            <HighlightCard
              key={feature.title}
              feature={feature}
              className={
                index === lastIndex && index % 2 === 0
                  ? "sm:col-span-2 lg:col-span-1"
                  : ""
              }
            />
          ))}
        </ul>
        <p className="mt-12 text-xs font-semibold uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">
          More in {meta.eyebrow}
        </p>
        <FeatureList id={area.id} features={area.features} />
      </div>
    </section>
  );
}
