interface CountBadgeProps {
  count: number;
  // What the number counts, read out as "4 unread automations".
  label: string;
  // "sm" rides inside a menu row, "md" sits beside a page title.
  size?: "sm" | "md";
  className?: string;
}

// A count of things waiting on the user. Filled with the accent's readable
// shade against the page background, so the digits keep their contrast in both
// themes; a single digit lands as a circle and larger counts grow into a pill.
export function CountBadge({ count, label, size = "sm", className = "" }: CountBadgeProps) {
  if (count <= 0) return null;
  const dims =
    size === "md"
      ? "h-[19px] min-w-[19px] px-1.5 text-[11px]"
      : "h-[17px] min-w-[17px] px-1.5 text-[10px]";
  return (
    <span
      aria-label={`${count} ${label}`}
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-[var(--accent-blue-text)] font-semibold leading-none tabular-nums tracking-tight text-[var(--bg-primary)] ${dims} ${className}`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
