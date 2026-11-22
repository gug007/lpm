import { useLayoutEffect, useRef } from "react";
import { Modal } from "./ui/Modal";
import { useAppStore } from "../store/app";
import type { TabVisit } from "../store/tabHistory";
import { peerSlugOf } from "../peer/markers";
import { peerAlias, type PeerClient } from "../peer/usePeerState";
import { GLOBAL_TERMINALS_KEY, GLOBAL_TERMINALS_LABEL } from "../terminals";
import { ProjectNameDisplay, findParentProject } from "./ProjectNameDisplay";

interface TabSwitcherProps {
  active: boolean;
  list: TabVisit[];
  index: number;
  // Paired machines, to name the one a tab is on.
  peers: PeerClient[];
}

export function TabSwitcher({ active, list, index, peers }: TabSwitcherProps) {
  const projects = useAppStore((s) => s.projects);
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the highlighted row visible as Ctrl+Tab moves the selection.
  useLayoutEffect(() => {
    const row = listRef.current?.children[index] as HTMLElement | undefined;
    row?.scrollIntoView({ block: "nearest" });
  }, [active, index]);

  return (
    <Modal
      open={active}
      onClose={() => {}}
      backdrop={false}
      closeOnEscape={false}
      autoFocus={false}
      zIndexClassName="z-[70]"
    >
      <div className="switcher-in w-[min(380px,86vw)] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] p-2 shadow-2xl">
        <div className="px-2 pb-1.5 pt-1 text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
          Switch tab
        </div>
        <div ref={listRef} className="flex max-h-[60vh] flex-col gap-0.5 overflow-y-auto">
          {list.map((visit, i) => {
            const project = projects.find((p) => p.name === visit.project);
            const slug = peerSlugOf(visit.project);
            return (
              <div
                key={`${visit.project}\u0000${visit.key}`}
                className={`flex shrink-0 flex-col gap-0.5 rounded-lg px-3 py-2 ${
                  i === index
                    ? "bg-[var(--bg-hover)] ring-1 ring-inset ring-[var(--accent-cyan)]/40"
                    : ""
                }`}
              >
                <span
                  className={`min-w-0 truncate text-sm ${
                    i === index ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
                  }`}
                >
                  {visit.label}
                </span>
                <span className="flex min-w-0 items-baseline gap-2 text-[11px] text-[var(--text-muted)]">
                  <span className="min-w-0 truncate">
                    {visit.project === GLOBAL_TERMINALS_KEY ? (
                      GLOBAL_TERMINALS_LABEL
                    ) : project ? (
                      <ProjectNameDisplay project={project} parent={findParentProject(project, projects)} />
                    ) : (
                      visit.project
                    )}
                  </span>
                  {slug && <span className="ml-auto shrink-0">{peerAlias(peers, slug)}</span>}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
