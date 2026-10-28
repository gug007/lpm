"use client";

import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { ChevronDown } from "lucide-react";
import { REVEAL_EVENT } from "./feature-id";
import FeatureItem from "./feature-item";
import type { Feature } from "./feature-types";

const PHONE_VISIBLE = 3;
const VISIBLE = 6;

type Props = { id: string; label: string; features: Feature[] };

export default function FeatureList({ id, label, features }: Props) {
  const [expanded, setExpanded] = useState(false);
  const listId = `${id}-more`;

  useEffect(() => {
    const onReveal = (event: Event) => {
      if ((event as CustomEvent<string>).detail === id) {
        flushSync(() => setExpanded(true));
      }
    };
    window.addEventListener(REVEAL_EVENT, onReveal);
    return () => window.removeEventListener(REVEAL_EVENT, onReveal);
  }, [id]);

  const hiddenClass = (index: number) => {
    if (expanded || index < PHONE_VISIBLE) return "";
    return index < VISIBLE ? "hidden sm:block" : "hidden";
  };

  return (
    <>
      <ul id={listId} className="mt-6 grid gap-x-10 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((feature, index) => (
          <FeatureItem
            key={feature.title}
            feature={feature}
            className={hiddenClass(index)}
          />
        ))}
      </ul>
      {!expanded && features.length > PHONE_VISIBLE && (
        <button
          type="button"
          aria-controls={listId}
          aria-expanded={false}
          onClick={() => setExpanded(true)}
          className={`mt-8 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full border border-gray-200 bg-white px-5 text-sm font-medium text-gray-700 transition-colors duration-200 hover:border-gray-300 hover:text-gray-900 sm:w-auto dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-300 dark:hover:border-gray-700 dark:hover:text-white ${
            features.length > VISIBLE ? "" : "sm:hidden"
          }`}
        >
          Show all {features.length} in {label}
          <ChevronDown className="h-4 w-4" aria-hidden />
        </button>
      )}
    </>
  );
}
