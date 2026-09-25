import { formatPercent, formatTokenCount, plural } from "./stats-format";
import { PROVIDERS, PROVIDER_META, type Provider } from "./stats-sample-data";

const SIZE = 140;
const STROKE = 14;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const GAP = 3;


export default function StatsDonut({
  claude,
  codex,
  sessions,
  active,
  onActive,
}: {
  claude: number;
  codex: number;
  sessions: Record<Provider, number>;
  active: Provider | null;
  onActive: (provider: Provider | null) => void;
}) {
  const tokens: Record<Provider, number> = { claude, codex };
  const total = claude + codex;
  const share = (provider: Provider) => tokens[provider] / Math.max(1, total);
  const shown = PROVIDERS.filter((provider) => tokens[provider] > 0);
  const single = shown.length === 1;

  const arcs = shown.map((provider, index) => {
    const start = shown.slice(0, index).reduce((sum, before) => sum + share(before), 0);
    return {
      provider,
      length: single ? CIRCUMFERENCE : Math.max(0, share(provider) * CIRCUMFERENCE - GAP),
      offset: single ? 0 : start * CIRCUMFERENCE + GAP / 2,
    };
  });

  return (
    <div>
      <p className="text-sm font-medium text-[var(--text-primary)]">Breakdown</p>
      <div className="relative mx-auto mt-4" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} aria-hidden>
          <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
            {arcs.map((arc) => (
              <circle
                key={arc.provider}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                fill="none"
                strokeWidth={STROKE}
                className="motion-safe:transition-opacity motion-safe:duration-[120ms]"
                style={{
                  stroke: PROVIDER_META[arc.provider].color,
                  strokeDasharray: `${arc.length} ${CIRCUMFERENCE}`,
                  strokeDashoffset: -arc.offset,
                  opacity: active && active !== arc.provider ? 0.3 : 1,
                }}
                onMouseEnter={() => onActive(arc.provider)}
                onMouseLeave={() => onActive(null)}
              />
            ))}
          </g>
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-2xl font-semibold tracking-tight tabular-nums text-[var(--text-primary)]">
            {formatTokenCount(active ? tokens[active] : total)}
          </p>
          <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
            {active
              ? `${formatPercent(share(active))} · ${plural(sessions[active], "session")}`
              : "tokens"}
          </p>
        </div>
      </div>

      <ul className="mx-auto mt-4 max-w-xs space-y-1 lg:max-w-none">
        {PROVIDERS.map((provider) => {
          const meta = PROVIDER_META[provider];
          return (
            <li key={provider}>
              <button
                type="button"
                onMouseEnter={() => onActive(provider)}
                onMouseLeave={() => onActive(null)}
                onFocus={() => onActive(provider)}
                onBlur={() => onActive(null)}
                onClick={() => onActive(provider)}
                className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition-[background-color,opacity] duration-[120ms] hover:bg-[var(--bg-hover)]"
                style={{ opacity: active && active !== provider ? 0.4 : 1 }}
              >
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: meta.color }}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-xs font-medium text-[var(--text-primary)]">
                      {meta.label}
                    </span>
                    <span className="shrink-0 text-xs font-medium tabular-nums text-[var(--text-primary)]">
                      {formatPercent(share(provider))}
                    </span>
                  </span>
                  <span className="flex items-baseline justify-between gap-2 text-[10px] text-[var(--text-muted)]">
                    <span className="tabular-nums">{formatTokenCount(tokens[provider])}</span>
                    <span className="tabular-nums">{plural(sessions[provider], "session")}</span>
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
