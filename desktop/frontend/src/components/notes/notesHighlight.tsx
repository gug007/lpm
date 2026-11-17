import type { ReactNode } from "react";

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type Highlighter = { pattern: RegExp; lower: Set<string> } | null;

export function buildHighlighter(tokens: string[]): Highlighter {
  if (tokens.length === 0) return null;
  return {
    pattern: new RegExp(`(${tokens.map(escapeRegex).join("|")})`, "ig"),
    lower: new Set(tokens.map((t) => t.toLowerCase())),
  };
}

// Matches via split-with-capture so the output preserves the source text's
// original casing — displaying "Docker" when the user searched "docker".
export function highlightTokens(text: string, h: Highlighter): ReactNode {
  if (!h) return text;
  return text.split(h.pattern).map((part, i) => {
    if (!part) return null;
    if (h.lower.has(part.toLowerCase())) {
      return (
        <mark
          key={i}
          className="rounded-sm bg-[var(--accent-amber)]/25 px-0.5 text-[var(--text-primary)]"
        >
          {part}
        </mark>
      );
    }
    return <span key={i}>{part}</span>;
  });
}
