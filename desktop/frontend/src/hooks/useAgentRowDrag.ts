import { useCallback, useRef, useState, type MouseEvent, type PointerEvent, type RefObject } from "react";
import type { SidebarAgentRow } from "../sidebarAgents";
import { useAppStore } from "../store/app";
import { knownTabTitles } from "../store/terminalTitles";
import { moveDestinations, moveTab } from "../tabMove";

const THRESHOLD = 4;
const TARGET_STYLE = "1px solid var(--accent-cyan)";

// The project's tabs, every pane's, in the order its tab strip reads.
function tabOrder(projectName: string, agents: SidebarAgentRow[]): string[] {
  const titles = knownTabTitles(projectName);
  const ids = titles ? Object.keys(titles) : [];
  for (const a of agents) if (a.terminalId && !ids.includes(a.terminalId)) ids.push(a.terminalId);
  return ids;
}

/** `id` moved to sit before `before` (or last), the rest kept in order. */
export function reorderedTabs(order: string[], id: string, before: string | null): string[] {
  const rest = order.filter((t) => t !== id);
  const at = before ? rest.indexOf(before) : -1;
  return at < 0 ? [...rest, id] : [...rest.slice(0, at), id, ...rest.slice(at)];
}

// Dragging an agent's line: up or down among the project's lines moves its tab
// in the tab strip, which the lines follow; onto another project's row moves
// the tab to that project, as Move to does. Listens in the capture phase, ahead
// of each line's own handlers, which keep the project row from dragging.
export function useAgentRowDrag(
  projectName: string,
  agents: SidebarAgentRow[],
  listRef: RefObject<HTMLDivElement | null>,
) {
  const [dropLine, setDropLine] = useState<number | null>(null);
  const dragged = useRef(false);
  const latest = useRef(agents);
  latest.current = agents;

  const onPointerDownCapture = useCallback(
    (e: PointerEvent) => {
      if (e.button !== 0) return;
      const line = (e.target as HTMLElement).closest<HTMLElement>("[data-agent-row]");
      const agent = line && latest.current.find((a) => a.key === line.dataset.agentRow);
      const list = listRef.current;
      if (!line || !agent?.terminalId || !list) return;
      const id = agent.terminalId;
      const startY = e.clientY;
      let moving = false;
      let before: string | null = null;
      let target: HTMLElement | null = null;
      dragged.current = false;

      const lines = () =>
        [...list.querySelectorAll<HTMLElement>("[data-agent-row]")]
          .map((el) => ({ el, agent: latest.current.find((a) => a.key === el.dataset.agentRow) }))
          .filter((l) => l.agent?.terminalId);
      const markTarget = (el: HTMLElement | null) => {
        if (target === el) return;
        if (target) target.style.outline = "";
        target = el;
        if (target) target.style.outline = TARGET_STYLE;
      };

      const move = (ev: globalThis.PointerEvent) => {
        if (!moving && Math.abs(ev.clientY - startY) < THRESHOLD) return;
        if (!moving) {
          moving = true;
          dragged.current = true;
          line.style.opacity = "0.5";
          document.body.style.cursor = "grabbing";
        }
        const over = document.elementFromPoint(ev.clientX, ev.clientY);
        const row = over?.closest<HTMLElement>("[data-project-row]");
        const inList = over ? list.contains(over) : false;
        markTarget(!inList && row && row.dataset.projectRow !== projectName ? row : null);
        if (!inList) {
          setDropLine(null);
          return;
        }
        const top = list.getBoundingClientRect().top;
        const all = lines();
        const next = all.find((l) => {
          const r = l.el.getBoundingClientRect();
          return ev.clientY < r.top + r.height / 2;
        });
        before = next?.agent?.terminalId ?? null;
        const edge = next ? next.el.getBoundingClientRect().top : all.at(-1)?.el.getBoundingClientRect().bottom;
        setDropLine(edge === undefined ? null : edge - top);
      };

      const end = (ev: globalThis.PointerEvent) => {
        window.removeEventListener("pointermove", move, true);
        window.removeEventListener("pointerup", end, true);
        window.removeEventListener("pointercancel", end, true);
        line.style.opacity = "";
        document.body.style.cursor = "";
        const dest = target?.dataset.projectRow;
        markTarget(null);
        setDropLine(null);
        if (!moving || ev.type === "pointercancel") return;
        if (dest) {
          const to = moveDestinations(projectName, useAppStore.getState().projects).find((d) => d.name === dest);
          if (to) moveTab(projectName, id, to);
          return;
        }
        const order = tabOrder(projectName, latest.current);
        const next = reorderedTabs(order, id, before);
        if (next.join("\n") !== order.join("\n")) {
          useAppStore.getState().triggerRemoteTerminalOp(projectName, "reorder", "", "", next);
        }
      };

      window.addEventListener("pointermove", move, true);
      window.addEventListener("pointerup", end, true);
      window.addEventListener("pointercancel", end, true);
    },
    [projectName, listRef],
  );

  // The click that ends a drag isn't a click on the line.
  const onClickCapture = useCallback((e: MouseEvent) => {
    if (!dragged.current) return;
    dragged.current = false;
    e.preventDefault();
    e.stopPropagation();
  }, []);

  return { dropLine, onPointerDownCapture, onClickCapture };
}
