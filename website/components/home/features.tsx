import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { SectionHeader } from "@/components/section-header";
import { FEATURES_PATH } from "@/lib/links";
import { FEATURE_INDEX, FEATURE_INDEX_FACTS } from "./feature-index-data";
import { FeatureIndexGroup } from "./feature-index-group";

export function Features() {
  return (
    <section id="features" className="scroll-mt-20 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeader
          className="mb-10 sm:mb-12"
          eyebrow="Everything in the box"
          title="From the first dev server to an open pull request"
          description="All of it is free, with no paid tier and no account. Pick a feature to see how it works."
        />
        <div className="grid gap-3 sm:gap-4 lg:grid-cols-3">
          {FEATURE_INDEX.map((group) => (
            <FeatureIndexGroup key={group.id} group={group} />
          ))}
        </div>
        <div className="mt-10 flex flex-col items-center gap-6">
          <ul className="flex max-w-xl flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px] text-gray-500 lg:max-w-none dark:text-gray-400">
            {FEATURE_INDEX_FACTS.map((fact) => (
              <li key={fact} className="inline-flex items-center gap-1.5">
                <Check
                  className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500"
                  aria-hidden
                />
                {fact}
              </li>
            ))}
          </ul>
          <Link
            href={FEATURES_PATH}
            className="group inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-gray-300 px-6 text-[15px] font-medium text-gray-800 transition-colors duration-200 hover:border-gray-400 hover:text-gray-900 dark:border-gray-700 dark:text-gray-200 dark:hover:border-gray-500 dark:hover:text-white"
          >
            See every feature
            <ArrowRight
              className="h-4 w-4 transition-transform duration-200 motion-safe:group-hover:translate-x-0.5"
              aria-hidden
            />
          </Link>
        </div>
      </div>
    </section>
  );
}
