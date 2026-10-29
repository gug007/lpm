import {
  RECAP_DEFAULT_THEME,
  RECAP_FONT,
  RECAP_GLOW_DEG,
  RECAP_HOURS_LABEL,
  RECAP_LAYOUT as L,
  RECAP_THEMES,
  RECAP_TOKENS_LABEL,
  type RecapTheme,
} from "./recapCardTheme";
import { RecapMark } from "./RecapMark";
import { mixText, type RecapView } from "./weeklyRecapModel";

const tileValue = { fontSize: 24, fontWeight: 800, lineHeight: `${L.tileValueLine}px` } as const;
const bigNumber = { fontWeight: 800, lineHeight: 1, letterSpacing: `${L.heroTracking}em` } as const;

/** "My agents' week" or month, sized to share: exactly the image it copies, with
 *  nothing on it that names a project. */
export function WeeklyRecapCard({
  view,
  theme = RECAP_DEFAULT_THEME,
}: {
  view: RecapView;
  theme?: RecapTheme;
}) {
  const C = RECAP_THEMES[theme];
  const row = { fontSize: L.rowSize, lineHeight: `${L.rowLine}px`, color: C.soft };
  const tileBox = {
    border: `1px solid ${C.border}`,
    borderRadius: L.tileRadius,
    background: C.tile,
    padding: `${L.tilePadY}px ${L.tilePadX}px`,
  };
  const tileLabel = { fontSize: 13, lineHeight: `${L.tileLabelLine}px`, color: C.muted };
  const columns = view.tiles.length + (view.lines ? 1 : 0);
  // The tokens lead and the hours follow, each over its label.
  const stacked = view.tokens
    ? [
        { value: view.tokens, label: RECAP_TOKENS_LABEL, size: L.heroSize },
        { value: view.hours, label: RECAP_HOURS_LABEL, size: L.hoursSize },
      ]
    : [];

  return (
    <div
      className="flex flex-col select-text"
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
        <span style={{ fontSize: L.titleSize, fontWeight: 700 }}>{view.title}</span>
        <span className="ml-auto" style={{ color: C.muted }}>
          {view.range}
        </span>
      </div>

      {stacked.length > 0 ? (
        stacked.map((big) => (
          <div key={big.label} className="flex flex-col" style={{ gap: L.stackGap }}>
            <span style={{ ...bigNumber, fontSize: big.size, color: C.strong }}>{big.value}</span>
            <span style={{ lineHeight: `${L.labelLine}px`, color: C.soft }}>{big.label}</span>
          </div>
        ))
      ) : (
        <div className="flex flex-wrap items-baseline gap-x-3">
          <span style={{ ...bigNumber, fontSize: L.heroSize, color: C.strong }}>{view.hours}</span>
          <span style={{ color: C.soft }}>{RECAP_HOURS_LABEL}</span>
        </div>
      )}

      {columns > 0 && (
        <div
          className="grid"
          style={{ gap: L.tileGap, gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {view.tiles.map((tile) => (
            <div key={tile.id} className="flex flex-col" style={tileBox}>
              <span className="tabular-nums" style={{ ...tileValue, color: C.strong }}>
                {tile.value}
              </span>
              <span style={tileLabel}>{tile.label}</span>
            </div>
          ))}
          {view.lines && (
            <div className="flex flex-col" style={tileBox}>
              <span className="tabular-nums" style={{ ...tileValue, fontSize: 20, color: C.green }}>
                {view.lines.added}
              </span>
              <span style={tileLabel}>
                <span style={{ color: C.red }}>{view.lines.removed}</span> lines
              </span>
            </div>
          )}
        </div>
      )}

      {view.mix.length > 0 && (
        <div className="truncate" style={row}>
          {mixText(view.mix)}
        </div>
      )}

      <div className="flex items-center justify-end" style={{ height: L.footerLine }}>
        <RecapMark colors={C} />
      </div>
    </div>
  );
}
