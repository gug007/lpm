import { useSettingsStore } from "../../store/settings";
import { RECAP_ROWS, type RecapRow, type RecapView } from "./weeklyRecapModel";

const LABELS: Record<RecapRow, string> = {
  tokens: "Tokens",
  prompts: "Prompts",
  sessions: "Sessions",
  lines: "Lines",
  agents: "Agents",
};

// Every row while the week is still being read.
function rowsOn(view: RecapView | null): readonly RecapRow[] {
  if (!view) return RECAP_ROWS;
  return [
    ...(view.tokens ? (["tokens"] as const) : []),
    ...view.tiles.map((tile) => tile.id),
    ...(view.lines ? (["lines"] as const) : []),
    ...(view.mix.length > 0 ? (["agents"] as const) : []),
  ];
}

/** A check for each row the week has; an unchecked one leaves the card and
 *  everything shared from it. */
export function RecapRowPicks({ full, leftOut }: { full: RecapView | null; leftOut: RecapRow[] }) {
  const update = useSettingsStore((s) => s.update);
  const toggle = (row: RecapRow) =>
    void update({
      weeklyRecapLeftOut: leftOut.includes(row)
        ? leftOut.filter((out) => out !== row)
        : [...leftOut, row],
    });

  return (
    <div role="group" aria-label="Show on the card" className="flex flex-wrap items-center gap-1">
      {rowsOn(full).map((row) => {
        const on = !leftOut.includes(row);
        return (
          <label
            key={row}
            className={`inline-flex cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors hover:bg-[var(--bg-hover)] ${
              on
                ? "border-[var(--border)] text-[var(--text-primary)]"
                : "border-dashed border-[var(--border)] text-[var(--text-muted)]"
            }`}
          >
            <input
              type="checkbox"
              checked={on}
              onChange={() => toggle(row)}
              className="size-3 accent-[var(--accent-green)]"
            />
            {LABELS[row]}
          </label>
        );
      })}
    </div>
  );
}
