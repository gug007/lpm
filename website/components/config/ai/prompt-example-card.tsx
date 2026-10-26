"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import type { PromptExample } from "./prompt-examples-data";

export function PromptExampleCard({ prompt, lands }: PromptExample) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <li className="flex flex-col rounded-xl border border-gray-200 bg-white px-4 py-3.5 dark:border-gray-800 dark:bg-white/[0.02]">
      <div className="flex items-start gap-3">
        <p className="flex-1 text-sm leading-relaxed text-gray-800 dark:text-gray-200">
          &ldquo;{prompt}&rdquo;
        </p>
        <button
          type="button"
          onClick={handleCopy}
          aria-label={copied ? "Copied" : "Copy prompt"}
          className="-mr-1.5 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-white/[0.06] dark:hover:text-white"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden />
          )}
        </button>
      </div>
      <p className="mt-auto pt-3 text-xs text-gray-500 dark:text-gray-400">
        {lands}
      </p>
    </li>
  );
}
