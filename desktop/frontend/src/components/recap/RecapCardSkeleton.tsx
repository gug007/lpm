import { LoaderCircle } from "lucide-react";
import { usePrefersReducedMotion } from "../stats/usePrefersReducedMotion";
import {
  RECAP_FONT,
  RECAP_GLOW_DEG,
  RECAP_HOURS_LABEL,
  RECAP_LAYOUT as L,
  RECAP_THEMES,
  RECAP_TOKENS_LABEL,
  type RecapTheme,
} from "./recapCardTheme";
import { RecapMark } from "./RecapMark";
import type { RecapRow } from "./weeklyRecapModel";

const TILES: { id: RecapRow; label: string }[] = [
  { id: "prompts", label: "prompts" },
  { id: "sessions", label: "agent sessions" },
  { id: "lines", label: "lines" },
];

/** The card while its week is read: laid out as it will be, in its theme, so
 *  nothing moves when the numbers arrive. */
export function RecapCardSkeleton({
  title,
  range,
  theme,
  leftOut,
}: {
  title: string;
  range: string;
  theme: RecapTheme;
  leftOut: readonly RecapRow[];
}) {
  const C = RECAP_THEMES[theme];
  const reduced = usePrefersReducedMotion();
  const pulse = reduced ? "" : "animate-pulse";
  const block = (width: number, height: number) => (
    <span
      className={`block shrink-0 ${pulse}`}
      style={{ width, height, borderRadius: 6, background: C.border }}
    />
  );
  const tiles = TILES.filter((tile) => !leftOut.includes(tile.id));
  const stacked = leftOut.includes("tokens")
    ? []
    : [
        { label: RECAP_TOKENS_LABEL, size: L.heroSize, width: 150 },
        { label: RECAP_HOURS_LABEL, size: L.hoursSize, width: 210 },
      ];

  return (
    <div
      aria-busy="true"
      className="flex flex-col"
      style={{
        width: L.width,
        boxSizing: "border-box",
        gap: L.gap,
        padding: `${L.padTop}px ${L.padX}px ${L.padBottom}px`,
        border: `1px solid ${C.border}`,
        borderRadius: L.radius,
        background: `linear-gradient(${RECAP_GLOW_DEG}deg, ${C.glow} 0%, ${C.ground} 55%)`,
        color: C.text,
        fontFamily: RECAP_FONT,
        fontSize: L.bodySize,
      }}
    >
      <div className="flex items-center gap-2" style={{ lineHeight: `${L.headerLine}px` }}>
        <span style={{ fontSize: L.titleSize, fontWeight: 700 }}>{title}</span>
        <span className="ml-auto" style={{ color: C.muted }}>
          {range}
        </span>
      </div>

      {stacked.length > 0 ? (
        stacked.map((big) => (
          <div key={big.label} className="flex flex-col" style={{ gap: L.stackGap }}>
            <span className="flex items-end" style={{ height: big.size }}>
              {block(big.width, Math.round(big.size * 0.8))}
            </span>
            <span style={{ lineHeight: `${L.labelLine}px`, color: C.soft }}>{big.label}</span>
          </div>
        ))
      ) : (
        <div className="flex flex-wrap items-end gap-x-3" style={{ minHeight: L.heroSize }}>
          {block(250, 52)}
          <span style={{ color: C.soft }}>{RECAP_HOURS_LABEL}</span>
        </div>
      )}

      {tiles.length > 0 && (
        <div
          className="grid"
          style={{ gap: L.tileGap, gridTemplateColumns: `repeat(${tiles.length}, minmax(0, 1fr))` }}
        >
          {tiles.map((tile) => (
            <div
              key={tile.id}
              className="flex flex-col"
              style={{
                border: `1px solid ${C.border}`,
                borderRadius: L.tileRadius,
                background: C.tile,
                padding: `${L.tilePadY}px ${L.tilePadX}px`,
              }}
            >
              <span className="flex items-center" style={{ height: L.tileValueLine }}>
                {block(56, 20)}
              </span>
              <span style={{ fontSize: 13, lineHeight: `${L.tileLabelLine}px`, color: C.muted }}>
                {tile.label}
              </span>
            </div>
          ))}
        </div>
      )}

      {!leftOut.includes("agents") && (
        <div className="flex items-center" style={{ height: L.rowLine }}>
          {block(110, 12)}
        </div>
      )}

      <div className="flex items-center gap-4" style={{ height: L.footerLine }}>
        <span
          role="status"
          className="flex min-w-0 flex-1 items-center gap-2"
          style={{ fontSize: 13, color: C.muted }}
        >
          <LoaderCircle size={13} className={reduced ? "shrink-0" : "shrink-0 animate-spin"} />
          <span className="truncate">Reading your agents' history…</span>
        </span>
        <RecapMark colors={C} />
      </div>
    </div>
  );
}
