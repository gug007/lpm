import { STAGES, WINDOWS, type Layout } from "./before-after-data";
import { LpmReplica } from "./before-after-replica";
import { PileWindowCard } from "./before-after-window";

// Both pictures stand on the same desk, so the divider only ever changes what is
// on it, never the ground under it.
const DESK =
  "absolute inset-0 bg-[linear-gradient(135deg,#e3e9f2,#b8c5d9)] dark:bg-[linear-gradient(135deg,#3b4454,#1e232c)]";

export function PileLayer({ layout }: { layout: Layout }) {
  return (
    <div aria-hidden="true" className={DESK}>
      {WINDOWS.map((win) => (
        <PileWindowCard key={win.key} win={win} layout={layout} />
      ))}
    </div>
  );
}

export function LpmLayer({ layout }: { layout: Layout }) {
  const { lpm } = STAGES[layout];
  return (
    <div aria-hidden="true" className={DESK}>
      <div
        className="absolute"
        style={{ left: `${lpm.x}em`, top: `${lpm.y}em`, width: `${lpm.w}em`, height: `${lpm.h}em` }}
      >
        <LpmReplica compact={layout === "phone"} />
      </div>
    </div>
  );
}
