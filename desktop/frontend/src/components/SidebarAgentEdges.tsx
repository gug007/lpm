import type { RefObject } from "react";
import { useAgentsOutOfView } from "../hooks/useAgentsOutOfView";

/** A line along whichever end of the project list has an agent past it, in the
 *  color of the most urgent one. Purely a sighting: every row stays reachable,
 *  so it adds nothing for a screen reader. */
export function SidebarAgentEdges({ listRef }: { listRef: RefObject<HTMLElement | null> }) {
  const { above, below } = useAgentsOutOfView(listRef);
  return (
    <>
      {above && <div aria-hidden data-edge="above" className={`sidebar-edge top-0 sidebar-edge-${above}`} />}
      {below && <div aria-hidden data-edge="below" className={`sidebar-edge bottom-0 sidebar-edge-${below}`} />}
    </>
  );
}
