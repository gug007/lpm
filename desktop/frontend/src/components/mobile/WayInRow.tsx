import type { ReactNode } from "react";
import { SUBTITLE_COLOR, TILE_STYLE, type TileTone } from "./styles";

/** One way a phone can reach this machine, or one setting under it: a tile,
 *  a title, one line about its state, and whatever acts on it. */
export function WayInRow({
  icon,
  title,
  badge,
  subtitle,
  tone = "idle",
  children,
}: {
  icon: ReactNode;
  title: string;
  badge?: string;
  subtitle: ReactNode;
  tone?: TileTone;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors"
        style={TILE_STYLE[tone]}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
          {title}
          {badge && (
            <span className="rounded-full bg-[color-mix(in_srgb,var(--accent-cyan)_14%,transparent)] px-1.5 py-px text-[10px] font-medium text-[var(--accent-cyan)]">
              {badge}
            </span>
          )}
        </p>
        <p className="break-words text-[11px] leading-relaxed" style={{ color: SUBTITLE_COLOR[tone] }}>
          {subtitle}
        </p>
      </div>
      {children && <div className="flex shrink-0 items-center gap-1">{children}</div>}
    </div>
  );
}
