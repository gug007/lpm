import type { ReactNode } from "react";
import { ChevronRightIcon, MoreVerticalIcon } from "./icons";

/** The 16px slot that leads every container header, sized once so a folder, a
 *  paired machine and the drag overlay all reserve the same square — and so the
 *  tree connector, which is measured to its centre, stays put. The glyph carries
 *  its own colour; nothing is filled behind it. */
export const HEADER_PLATE_CLASS =
  "flex h-4 w-4 shrink-0 items-center justify-center [&_svg]:h-[11px] [&_svg]:w-[11px]";

const NEUTRAL_PLATE_CLASS = "text-[var(--text-secondary)]";

interface SidebarHeaderShellProps {
  /** The identity glyph in the plate: a folder, a laptop, a server. */
  glyph: ReactNode;
  /** Tint for the plate, when it carries a signal of its own. */
  plateClass?: string;
  /** Whether the chevron holds the plate at rest instead of only under the
   *  cursor — true where the disclosure is the only thing the plate has to say. */
  chevronAtRest?: boolean;
  expanded: boolean;
  line1: ReactNode;
  /** The second line, which costs 16px and so only renders when the header has
   *  something to say that its rows are not already saying. */
  line2?: ReactNode;
  /** Sits at the end of line 1, and only while line 2 is silent — the line says
   *  it better than a numeral does. */
  trailing?: ReactNode;
  active: boolean;
  isContextTarget: boolean;
  showMore: boolean;
  moreLabel: string;
  onToggle: () => void;
  onMore: (x: number, y: number) => void;
}

export function SidebarHeaderShell({
  glyph,
  plateClass,
  chevronAtRest,
  expanded,
  line1,
  line2,
  trailing,
  active,
  isContextTarget,
  showMore,
  moreLabel,
  onToggle,
  onMore,
}: SidebarHeaderShellProps) {
  const twoLine = Boolean(line2);
  return (
    // The name repeats on the button: hover has to cover the ⋮, which cannot
    // live inside a button, while focus-visible only ever lands on the button.
    <div className="group/hdr relative">
      <button
        type="button"
        onClick={onToggle}
        onContextMenu={(e) => {
          e.preventDefault();
          onMore(e.clientX, e.clientY);
        }}
        aria-expanded={expanded}
        // The plate's glyph swap is the only focus cue the shell would otherwise
        // have, and an expanded folder holds the chevron at rest — so keyboard
        // focus needs a mark of its own.
        className={`group/hdr flex w-full select-none gap-2 rounded-md px-2 text-left outline-none transition-colors focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--accent-cyan)]/60 ${
          twoLine ? "items-start py-1" : "h-[26px] items-center"
        } ${active ? "bg-[var(--bg-active)]" : "hover:bg-[var(--bg-hover)]"} ${
          isContextTarget ? "ring-1 ring-inset ring-[var(--accent-cyan)]/60" : ""
        }`}
      >
        <span
          className={`relative ${HEADER_PLATE_CLASS} ${plateClass ?? NEUTRAL_PLATE_CLASS} ${
            twoLine ? "mt-[3px]" : ""
          }`}
        >
          <span
            className={`absolute inset-0 flex items-center justify-center transition-opacity duration-100 ${
              chevronAtRest
                ? "opacity-0"
                : "group-hover/hdr:opacity-0 group-focus-visible/hdr:opacity-0"
            }`}
          >
            {glyph}
          </span>
          <span
            // Both properties: the arrow fades in and sweeps round, and naming
            // only `opacity` would drop the rotation to a single frame.
            className={`absolute inset-0 flex items-center justify-center transition-[opacity,transform] duration-150 ${
              expanded ? "rotate-90" : ""
            } ${
              chevronAtRest
                ? ""
                : "opacity-0 group-hover/hdr:opacity-100 group-focus-visible/hdr:opacity-100"
            }`}
          >
            <ChevronRightIcon />
          </span>
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          {/* The ⋮ reserve lives here rather than on the button, so line 2 gets
              the full width. */}
          <span className="flex min-w-0 items-baseline pr-7">
            {line1}
            {!twoLine && trailing}
          </span>
          {line2 && (
            <span className="mt-px truncate text-[10px] leading-[13px] text-[var(--text-muted)]">
              {line2}
            </span>
          )}
        </span>
      </button>
      {showMore && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (isContextTarget) return;
            const rect = e.currentTarget.getBoundingClientRect();
            onMore(rect.left, rect.bottom + 4);
          }}
          // The drag listeners sit on the whole row.
          onPointerDown={(e) => e.stopPropagation()}
          // Centred on the header while it is one line; on line 1's centre —
          // 2px down, not the box's middle — once a second line is under it.
          className={`absolute right-1 flex h-6 w-6 items-center justify-center rounded text-[var(--text-muted)] transition-opacity hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] ${
            twoLine ? "top-[2px]" : "top-1/2 -translate-y-1/2"
          } ${
            isContextTarget
              ? "opacity-100"
              : "pointer-events-none opacity-0 group-hover/hdr:pointer-events-auto group-hover/hdr:opacity-100"
          }`}
          title={moreLabel}
          aria-label={moreLabel}
        >
          <MoreVerticalIcon />
        </button>
      )}
    </div>
  );
}
