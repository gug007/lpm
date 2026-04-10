"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { INSTALL_CMD } from "@/lib/links";

export function CopyInstall() {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(INSTALL_CMD);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex items-center gap-3 pl-5 pr-1.5 py-1.5 bg-gray-100/80 dark:bg-white/[0.05] border border-gray-200/60 dark:border-white/[0.08] rounded-full min-w-0 hover:bg-gray-100 dark:hover:bg-white/[0.07] hover:border-gray-300/80 dark:hover:border-white/[0.12] transition-all duration-200">
      <code className="flex-1 text-xs sm:text-[13px] font-mono text-gray-700 dark:text-gray-300 select-all whitespace-nowrap overflow-x-auto min-w-0 scrollbar-none">
        {INSTALL_CMD}
      </code>
      <button
        onClick={copy}
        className="group flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:scale-[1.05] active:scale-95 transition-transform duration-200 cursor-pointer"
        title="Copy to clipboard"
        aria-label="Copy install command"
      >
        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
      </button>
    </div>
  );
}
