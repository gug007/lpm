"use client";

import { useRef, useState, type ReactNode } from "react";
import { Check, Copy, FileText } from "lucide-react";

export function CodeBlock({
  filename,
  children,
}: {
  filename?: string;
  children: ReactNode;
}) {
  const preRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const text = preRef.current?.textContent ?? "";
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore clipboard failures
    }
  };

  return (
    <div className="group relative rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden mb-4">
      {filename && (
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-900/80">
          <FileText className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
          <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">
            {filename}
          </span>
        </div>
      )}
      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? "Copied" : "Copy code"}
        className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-md border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-900/80 backdrop-blur px-2 py-1 text-[10px] font-medium text-gray-500 dark:text-gray-400 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-gray-900 dark:hover:text-white hover:border-gray-300 dark:hover:border-gray-600 transition-opacity"
      >
        {copied ? (
          <>
            <Check className="w-3 h-3 text-emerald-500" />
            Copied
          </>
        ) : (
          <>
            <Copy className="w-3 h-3" />
            Copy
          </>
        )}
      </button>
      <pre
        ref={preRef}
        className="px-4 py-3 text-xs font-mono text-gray-700 dark:text-gray-300 leading-relaxed overflow-x-auto"
      >
        <code>{children}</code>
      </pre>
    </div>
  );
}

export function Comment({ children }: { children: ReactNode }) {
  return (
    <span className="text-gray-400 dark:text-gray-500">{children}</span>
  );
}
