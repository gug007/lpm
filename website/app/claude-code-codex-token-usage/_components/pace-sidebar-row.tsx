import { barColor, durationShort, showsTick, type Pace } from "./pace-model";
import { PROVIDERS, type Provider } from "./pace-presets";

export default function PaceSidebarRow({
  provider,
  used,
  pace,
}: {
  provider: Provider;
  used: number;
  pace: Pace;
}) {
  const { name, dot } = PROVIDERS[provider];
  const clamped = Math.max(0, Math.min(100, used));
  const width = clamped > 0 ? Math.max(2, Math.round(clamped)) : 0;

  return (
    <div
      aria-hidden
      className="flex max-w-[17rem] flex-col gap-1 rounded-md bg-[var(--bg-sidebar)] px-3 py-1.5"
    >
      <span className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: dot }} />
        <span className="min-w-[42px] max-w-[96px] shrink-0 truncate text-[11px] text-[var(--text-secondary)]">
          {name}
        </span>
        <span className="ml-auto min-w-0 truncate text-[10px] tabular-nums text-[var(--text-muted)]">
          {durationShort(pace.resetInMs)}
        </span>
        <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-[var(--text-secondary)]">
          {Math.round(used)}%
        </span>
      </span>
      <span className="relative block">
        <span className="block h-[3px] w-full overflow-hidden rounded-full bg-[var(--bg-active)]">
          <span
            className="block h-full rounded-full motion-safe:transition-[width] motion-safe:duration-500"
            style={{ width: `${width}%`, backgroundColor: barColor(used) }}
          />
        </span>
        {showsTick(pace) && (
          <span
            className="absolute -top-[3px] h-[9px] w-0.5 -translate-x-1/2 rounded-full bg-[var(--text-primary)]"
            style={{ left: `${pace.elapsedPercent}%` }}
          />
        )}
      </span>
    </div>
  );
}
