import { Children, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";
import { dealDurationMs } from "./sidebarDeck";

interface SidebarDeckRunProps {
  runId: string;
  collapsed: boolean;
  /** One node per child row, built by the sidebar — connectors, drag wrapper and
   *  all — so a deck inside a folder keeps the folder's tree. */
  children: ReactNode;
}

type Phase = "idle" | "in" | "out";

/** The rows a deck holds.
 *
 *  Only a toggle animates them — a status tick or any other re-render leaves
 *  them where they are. Gathering back needs the rows on screen after the
 *  sidebar has stopped emitting them, so the last dealt set is held and replayed
 *  in reverse; it is a snapshot of nodes already built, and lives only as long as
 *  the animation. */
export function SidebarDeckRun({ runId, collapsed, children }: SidebarDeckRunProps) {
  const reducedMotion = usePrefersReducedMotion();
  const rows = Children.toArray(children);
  const held = useRef<ReactNode[]>(rows);
  const wasCollapsed = useRef(collapsed);
  const [phase, setPhase] = useState<Phase>("idle");
  const [gathering, setGathering] = useState(false);

  if (!collapsed && rows.length > 0) held.current = rows;

  // Layout, not passive: a passive effect would paint the run empty for a frame
  // before the held rows came back, remounting every one.
  useLayoutEffect(() => {
    const toggled = wasCollapsed.current !== collapsed;
    wasCollapsed.current = collapsed;
    // Anything that is not a fold — first paint, or the motion setting changing
    // mid-deal — settles the deck where it stands. Returning early instead would
    // clear the running timer and strand a shut deck's rows on screen.
    if (reducedMotion || !toggled) {
      setPhase("idle");
      setGathering(false);
      return;
    }
    if (!collapsed) {
      setPhase("in");
      // The deal has to expire, or a row added later mounts into a finished
      // animation and slides in on a stale delay.
      const landed = setTimeout(() => setPhase("idle"), dealDurationMs(held.current.length));
      return () => clearTimeout(landed);
    }
    setPhase("out");
    setGathering(true);
    const gathered = setTimeout(() => {
      setGathering(false);
      setPhase("idle");
    }, dealDurationMs(held.current.length));
    return () => clearTimeout(gathered);
  }, [collapsed, reducedMotion]);

  const visible = collapsed ? (gathering ? held.current : []) : rows;
  const dealt = visible.length > 0;

  return (
    <div id={runId} hidden={!dealt}>
      {visible.map((row, i) => (
        <div
          key={i}
          className={phase === "in" ? "deck-deal-in" : phase === "out" ? "deck-deal-out" : undefined}
          style={{ "--deal-i": phase === "out" ? visible.length - 1 - i : i } as React.CSSProperties}
        >
          {row}
        </div>
      ))}
    </div>
  );
}
