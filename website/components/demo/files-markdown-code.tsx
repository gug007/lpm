"use client";

import { useEffect, useMemo, useState } from "react";
import { highlight, langOf } from "./code-highlight";
import { FOCUS_RING } from "./ui";

// A fenced block in the Markdown preview, coloured by the same tokenizer as the
// source view, with the app's copy affordance.
export function FilesMarkdownCode({ code, lang }: { code: string; lang: string }) {
  const lines = useMemo(() => highlight(code, langOf(`x.${lang}`)), [code, lang]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(t);
  }, [copied]);

  return (
    <div className="my-2 overflow-hidden rounded-md border border-[#2e2e2e] bg-[#242424]">
      {lang && (
        <div className="flex items-center justify-between border-b border-[#2e2e2e] px-3 py-1 text-[10px] uppercase tracking-wider text-[#919191]">
          <span>{lang}</span>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(code);
              setCopied(true);
            }}
            className={`rounded px-1 text-[10px] ${
              copied ? "text-[#5ffa68]" : "hover:bg-[#1a1a1a] hover:text-[#e5e5e5]"
            } ${FOCUS_RING}`}
          >
            {copied ? "copied" : "copy"}
          </button>
        </div>
      )}
      <pre className="overflow-x-auto px-3 py-2 text-[12px] leading-5">
        <code className="font-mono">
          {lines.map((tokens, i) => (
            <div key={i}>
              {tokens.length === 0
                ? " "
                : tokens.map((token, j) => (
                    <span key={j} className={token.cls}>
                      {token.text}
                    </span>
                  ))}
            </div>
          ))}
        </code>
      </pre>
    </div>
  );
}
