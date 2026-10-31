export type GlyphState = "running" | "stopped" | "crashed" | "error";

const GLYPH_LABEL: Record<GlyphState, string> = {
  running: "Running",
  stopped: "Stopped",
  crashed: "Crashed",
  error: "Config error",
};

const SIZE = { sm: "h-1.5 w-1.5", md: "h-2 w-2" } as const;

/** A status light whose shape says the state as well as its color, so it
 *  still reads in grayscale or to someone who can't tell red from green: a
 *  filled dot runs, a ring is stopped, a cross crashed, and a bar over a dot
 *  is a config the app couldn't read. */
export function StateGlyph({
  state,
  size = "md",
  title,
  className = "",
}: {
  state: GlyphState;
  size?: keyof typeof SIZE;
  title?: string;
  className?: string;
}) {
  const box = `inline-block shrink-0 ${SIZE[size]} ${className}`;
  const label = title ?? GLYPH_LABEL[state];

  if (state === "running" || state === "stopped") {
    const fill =
      state === "running"
        ? "bg-[var(--accent-green)]"
        : "border border-[var(--text-muted)] bg-[var(--bg-primary)]";
    return <span role="img" aria-label={label} title={label} className={`${box} rounded-full ${fill}`} />;
  }

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox="0 0 8 8"
      className={`${box} overflow-visible text-[var(--accent-red)]`}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
    >
      <title>{label}</title>
      {state === "crashed" ? (
        <path d="M1 1l6 6M7 1L1 7" strokeWidth="1.9" />
      ) : (
        <>
          <path d="M4 0.6v3.9" strokeWidth="1.9" />
          <circle cx="4" cy="7" r="1.05" fill="currentColor" stroke="none" />
        </>
      )}
    </svg>
  );
}
