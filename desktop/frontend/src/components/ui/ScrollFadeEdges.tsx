interface ScrollFadeEdgesProps {
  canScrollLeft: boolean;
  canScrollRight: boolean;
  // Full Tailwind class (not a bare color) so the arbitrary value stays visible
  // to Tailwind's source scan at the call site, e.g. "from-[var(--terminal-bg)]".
  from: string;
}

// Edge fades for a horizontally scrolling strip, each shown only while there is
// more content past that edge. Sits in a `relative` host beside the scroller.
export function ScrollFadeEdges({ canScrollLeft, canScrollRight, from }: ScrollFadeEdgesProps) {
  const edge = `pointer-events-none absolute inset-y-0 z-10 w-6 ${from} to-transparent`;
  return (
    <>
      {canScrollLeft && <div className={`${edge} left-0 bg-gradient-to-r`} />}
      {canScrollRight && <div className={`${edge} right-0 bg-gradient-to-l`} />}
    </>
  );
}
