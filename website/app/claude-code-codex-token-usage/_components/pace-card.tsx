import PaceMeter from "./pace-meter";
import PaceSidebarRow from "./pace-sidebar-row";
import { WINDOW, type Pace, type WindowKind } from "./pace-model";
import { PROVIDERS, type Provider } from "./pace-presets";

export default function PaceCard({
  provider,
  kind,
  used,
  pace,
  resetLine,
}: {
  provider: Provider;
  kind: WindowKind;
  used: number;
  pace: Pace;
  resetLine: string;
}) {
  const { name, dot } = PROVIDERS[provider];
  const { label } = WINDOW[kind];

  return (
    <div
      data-on-dark
      className="replica-ui rounded-2xl bg-[#0d0d0d] p-3 ring-1 ring-black/10 sm:p-4 dark:ring-white/10"
    >
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-4">
        <div className="flex items-center gap-2 border-b border-[var(--border)] pb-3">
          <span
            aria-hidden
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: dot }}
          />
          <p className="text-sm font-medium tracking-tight text-[var(--text-primary)]">{name}</p>
          <p className="ml-auto text-[11px] tabular-nums text-[var(--text-muted)]">
            updated just now
          </p>
        </div>

        <div className="pt-4">
          <PaceMeter label={label} used={used} pace={pace} resetLine={resetLine} />
        </div>

        <div aria-hidden className="mt-5 border-t border-[var(--border)] pt-4">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.13em] text-[var(--text-muted)]">
            Sidebar · {label} window
          </p>
          <PaceSidebarRow provider={provider} used={used} pace={pace} />
        </div>
      </div>
    </div>
  );
}
