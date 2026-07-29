import { useCallback, useEffect, useRef, useState } from "react";
import { compareFleetRows, type FleetRow } from "./fleetRows";

/** How long a hold outlives the reach that started it. */
export const FLEET_RESETTLE_MS = 1200;

type Timer = { current: number | null };

/** Rows the frozen order never saw sort to the bottom in attention order: a row
 *  that arrives mid-hold has no place to land without moving something. */
export function applyFrozenOrder(
  rows: FleetRow[],
  ranks: ReadonlyMap<string, number>,
): FleetRow[] {
  return [...rows].sort((a, b) => {
    const ra = ranks.get(a.id);
    const rb = ranks.get(b.id);
    if (ra !== undefined && rb !== undefined) return ra - rb;
    if (ra !== undefined) return -1;
    if (rb !== undefined) return 1;
    return compareFleetRows(a, b);
  });
}

/** Whether some row belongs above the one ahead of it, which only a hold can cause. */
export function fleetOrderIsStale(rows: readonly FleetRow[]): boolean {
  return rows.some((row, i) => i > 0 && compareFleetRows(row, rows[i - 1]) < 0);
}

export interface FleetOrder {
  /** `rows`, in the held order while frozen and in attention order otherwise. */
  rows: FleetRow[];
  /** Held, and a row that belongs higher is stuck below — worth telling the user. */
  stale: boolean;
  hold: () => void;
  release: () => void;
  /** Holds the order until the keyboard goes quiet. */
  holdForKey: () => void;
  /** Drop every hold and re-sort now. */
  resettle: () => void;
}

function clear(timer: Timer) {
  if (timer.current !== null) {
    window.clearTimeout(timer.current);
    timer.current = null;
  }
}

function arm(timer: Timer, expire: () => void) {
  clear(timer);
  timer.current = window.setTimeout(() => {
    timer.current = null;
    expire();
  }, FLEET_RESETTLE_MS);
}

export function useFleetOrder(rows: FleetRow[]): FleetOrder {
  const [pointerHeld, setPointerHeld] = useState(false);
  const [keyHeld, setKeyHeld] = useState(false);
  const pointerTimer = useRef<number | null>(null);
  const keyTimer = useRef<number | null>(null);
  const ranks = useRef<Map<string, number> | null>(null);

  const hold = useCallback(() => {
    clear(pointerTimer);
    setPointerHeld(true);
  }, []);

  const release = useCallback(() => {
    arm(pointerTimer, () => setPointerHeld(false));
  }, []);

  const holdForKey = useCallback(() => {
    setKeyHeld(true);
    arm(keyTimer, () => setKeyHeld(false));
  }, []);

  const resettle = useCallback(() => {
    clear(pointerTimer);
    clear(keyTimer);
    setPointerHeld(false);
    setKeyHeld(false);
  }, []);

  // Leaving the app abandons the reach; nothing else will arrive to end the hold.
  useEffect(() => {
    window.addEventListener("blur", resettle);
    return () => {
      window.removeEventListener("blur", resettle);
      clear(pointerTimer);
      clear(keyTimer);
    };
  }, [resettle]);

  const frozen = pointerHeld || keyHeld;
  // Captured during render, not in an effect: the first frame after the pointer
  // arrives must already be frozen, or it would freeze an order nobody saw.
  if (frozen) {
    if (ranks.current === null) {
      ranks.current = new Map(rows.map((row, i) => [row.id, i]));
    }
  } else if (ranks.current !== null) {
    ranks.current = null;
  }

  const held = ranks.current ? applyFrozenOrder(rows, ranks.current) : rows;

  return {
    rows: held,
    stale: frozen && fleetOrderIsStale(held),
    hold,
    release,
    holdForKey,
    resettle,
  };
}
