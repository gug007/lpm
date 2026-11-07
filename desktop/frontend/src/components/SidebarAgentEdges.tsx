import type { RefObject } from "react";
import { useAgentsOutOfView } from "../hooks/useAgentsOutOfView";
import { SidebarAgentEdge } from "./SidebarAgentEdge";

/** A line along whichever end of the project list has agents past it. Purely a
 *  sighting: every row stays reachable, so it adds nothing for a screen reader. */
export function SidebarAgentEdges({ listRef }: { listRef: RefObject<HTMLElement | null> }) {
  const { above, below, width } = useAgentsOutOfView(listRef);
  return (
    <>
      {above.length > 0 && <SidebarAgentEdge end="above" agents={above} width={width} />}
      {below.length > 0 && <SidebarAgentEdge end="below" agents={below} width={width} />}
    </>
  );
}
