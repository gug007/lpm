import type { ReactNode } from "react";
import { MATCH_CLASS, matchRanges } from "./skillSearch";

interface HighlightedTextProps {
  text: string;
  query: string;
}

// `text` with each place the search found in it marked.
export function HighlightedText({ text, query }: HighlightedTextProps) {
  const ranges = matchRanges(text, query);
  if (ranges.length === 0) return <>{text}</>;
  const parts: ReactNode[] = [];
  let at = 0;
  for (const [start, end] of ranges) {
    if (start > at) parts.push(text.slice(at, start));
    parts.push(
      <mark key={start} className={MATCH_CLASS}>
        {text.slice(start, end)}
      </mark>,
    );
    at = end;
  }
  if (at < text.length) parts.push(text.slice(at));
  return <>{parts}</>;
}
