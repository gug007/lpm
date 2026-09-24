import { useLayoutEffect, useRef } from "react";

// The host's own words, whole. What comes back is often several lines whose
// useful one is rarely the first, so this wraps instead of truncating, scrolls
// when an installer was involved, and can be selected to paste somewhere. It
// opens scrolled to the end: an installer's own verdict is its last line, below
// everything the package manager printed on the way.
export function HostActionError({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [text]);

  return (
    <p
      ref={ref}
      className="mt-0.5 max-h-24 select-text overflow-y-auto whitespace-pre-line break-words text-[11px] text-[var(--accent-red)]"
    >
      {text}
    </p>
  );
}
