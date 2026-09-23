import { LimitMeter } from "./limit-meter";
import type { LimitCardSample } from "./plan-limits-data";

export function LimitCard({ card }: { card: LimitCardSample }) {
  return (
    <article className="rounded-xl border border-white/10 bg-[#181818] p-4">
      <header className="flex items-center gap-2 border-b border-white/[0.06] pb-3">
        <span
          aria-hidden
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: card.dot }}
        />
        <h3 className="text-sm font-medium text-white">{card.name}</h3>
        <span className="ml-auto text-[11px] tabular-nums text-white/45">
          {card.updated}
        </span>
      </header>
      <div className="grid grid-cols-2 gap-x-5 gap-y-5 pt-4">
        {card.windows.map((w) => (
          <LimitMeter key={w.label} window={w} />
        ))}
      </div>
    </article>
  );
}
