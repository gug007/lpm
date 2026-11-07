import { edgeLineRuns, type EdgeAgentState } from "../sidebarAgentEdges";

/** The line along one end of the project list: a piece per agent past it. Each
 *  state is one layer masked to its pieces, so they sweep or pulse together. */
export function SidebarAgentEdge({
  end,
  agents,
  width,
}: {
  end: "above" | "below";
  agents: EdgeAgentState[];
  width: number;
}) {
  return (
    <div aria-hidden data-edge={end} className={`sidebar-edge ${end === "above" ? "top-0" : "bottom-0"}`}>
      {edgeLineRuns(agents, width).map(({ tone, mask }) => (
        <span
          key={tone}
          className={`sidebar-edge-run sidebar-edge-${tone}`}
          style={{ maskImage: mask, WebkitMaskImage: mask }}
        />
      ))}
    </div>
  );
}
