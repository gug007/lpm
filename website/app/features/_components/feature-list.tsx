"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import FeatureItem from "./feature-item";
import type { Feature } from "./feature-types";

const PHONE_VISIBLE = 3;

export default function FeatureList({ id, features }: { id: string; features: Feature[] }) {
  const [expanded, setExpanded] = useState(false);
  const hiddenCount = expanded ? 0 : Math.max(0, features.length - PHONE_VISIBLE);
  const listId = `${id}-more`;
  return (
    <>
      <ul
        id={listId}
        className="mt-4 grid gap-x-10 gap-y-7 sm:grid-cols-2 lg:grid-cols-3"
      >
        {features.map((feature, index) => (
          <FeatureItem
            key={feature.title}
            feature={feature}
            phoneHidden={!expanded && index >= PHONE_VISIBLE}
          />
        ))}
      </ul>
      {hiddenCount > 0 && (
        <button
          type="button"
          aria-controls={listId}
          aria-expanded={expanded}
          onClick={() => setExpanded(true)}
          className="mt-7 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full border border-gray-200 bg-white px-5 text-sm font-medium text-gray-700 transition-colors duration-200 hover:border-gray-300 hover:text-gray-900 sm:hidden dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-300 dark:hover:border-gray-700 dark:hover:text-white"
        >
          Show {hiddenCount} more features
          <ChevronDown className="h-4 w-4" aria-hidden />
        </button>
      )}
    </>
  );
}
