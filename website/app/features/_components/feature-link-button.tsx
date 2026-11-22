"use client";

import { useEffect, useState } from "react";
import { Check, Link2 } from "lucide-react";
import { featureSharePath } from "./feature-id";

type Props = { title: string };

export default function FeatureLinkButton({ title }: Props) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = () => {
    const url = `${window.location.origin}${featureSharePath(title)}`;
    navigator.clipboard.writeText(url).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  };

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy a link to ${title}`}
      className={`inline-flex h-6 items-center gap-1 rounded-full border border-gray-200 px-2 text-[11px] font-medium text-gray-500 transition-[color,border-color,opacity] duration-200 hover:border-gray-300 hover:text-gray-900 focus-visible:opacity-100 dark:border-gray-800 dark:text-gray-400 dark:hover:border-gray-700 dark:hover:text-white ${
        copied ? "" : "sm:opacity-0 sm:group-hover:opacity-100"
      }`}
    >
      {copied ? (
        <Check className="h-3 w-3" aria-hidden />
      ) : (
        <Link2 className="h-3 w-3" aria-hidden />
      )}
      <span aria-live="polite">{copied ? "Copied" : "Link"}</span>
    </button>
  );
}
