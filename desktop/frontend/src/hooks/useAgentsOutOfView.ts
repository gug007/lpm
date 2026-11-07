import { useEffect, useState, type RefObject } from "react";
import { EDGE_AGENT_ATTR, agentsOutOfView, type AgentsOutOfView } from "../sidebarAgentEdges";

const NONE: AgentsOutOfView = { above: [], below: [], width: 0 };

const same = (a: AgentsOutOfView, b: AgentsOutOfView) =>
  a.width === b.width && a.above.join() === b.above.join() && a.below.join() === b.below.join();

/** Follows which agents sit past the ends of a scrolling list. It only measures
 *  after something moved, at most once a frame, so an idle list costs nothing. */
export function useAgentsOutOfView(listRef: RefObject<HTMLElement | null>): AgentsOutOfView {
  const [edges, setEdges] = useState(NONE);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const next = agentsOutOfView(list);
      setEdges((prev) => (same(prev, next) ? prev : next));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    schedule();
    list.addEventListener("scroll", schedule, { passive: true });
    const resize = new ResizeObserver(schedule);
    resize.observe(list);
    const rows = new MutationObserver(schedule);
    rows.observe(list, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [EDGE_AGENT_ATTR],
    });
    return () => {
      cancelAnimationFrame(frame);
      list.removeEventListener("scroll", schedule);
      resize.disconnect();
      rows.disconnect();
    };
  }, [listRef]);

  return edges;
}
