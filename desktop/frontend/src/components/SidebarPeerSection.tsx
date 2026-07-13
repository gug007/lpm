import { useState } from "react";
import { StatusDot } from "./StatusDot";
import { ChevronRightIcon, XIcon } from "./icons";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { peerRawName, peerSlugOf } from "../peer/markers";
import { isPeerSectionCollapsed, setPeerSectionCollapsed } from "../peer/peerSectionCollapse";
import { PeerRemove } from "../../bridge/commands";
import { useAppStore } from "../store/app";
import {
  type ProjectInfo,
  STATUS_RUNNING,
  STATUS_DONE,
  STATUS_WAITING,
  STATUS_ERROR,
} from "../types";

const ROW_BASE_CLASS =
  "flex w-full select-none items-center gap-3 rounded-md px-3 py-2 text-left text-sm outline-none transition-colors";

function statusClass(project: ProjectInfo): string | null {
  const entries = project.statusEntries ?? [];
  const has = (v: string) => entries.some((e) => e.value === v);
  if (has(STATUS_ERROR)) return "text-red-400";
  if (has(STATUS_WAITING)) return "sidebar-waiting";
  if (has(STATUS_RUNNING)) return "sidebar-shimmer";
  if (has(STATUS_DONE)) return null;
  return null;
}

// A connected peer's projects, rendered below the local projects as a flat,
// non-reorderable section headed by the peer's name. The header collapses the
// section and offers a hover-revealed disconnect. Selecting a row opens the
// exact same ProjectDetail a local project uses.
export function SidebarPeerSection({
  slug,
  alias,
  projects,
  selected,
  onSelect,
}: {
  slug: string;
  alias: string;
  projects: ProjectInfo[];
  selected: string | null;
  onSelect: (name: string) => void;
}) {
  const clearSelection = useAppStore((s) => s.clearSelection);
  const [collapsed, setCollapsed] = useState(() => isPeerSectionCollapsed(slug));
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (projects.length === 0) return null;

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      setPeerSectionCollapsed(slug, next);
      return next;
    });
  };

  const confirmRemove = () => {
    const affectsSelection = peerSlugOf(selected) === slug;
    void PeerRemove(slug);
    if (affectsSelection) clearSelection();
    setConfirmOpen(false);
  };

  return (
    <div className="mt-3">
      <div className="group/peer relative">
        <button
          onClick={toggle}
          className="flex w-full select-none items-center gap-1 rounded-md px-2 py-1 text-left text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)] outline-none transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)] group-hover/peer:pr-9"
        >
          <span
            className={`shrink-0 transition-transform duration-150 ${collapsed ? "" : "rotate-90"}`}
          >
            <ChevronRightIcon />
          </span>
          <span className="truncate">{alias}</span>
          <span className="shrink-0 opacity-70">— remote</span>
          {collapsed && (
            <span className="ml-auto shrink-0 text-[11px] tabular-nums text-[var(--text-muted)] transition-opacity group-hover/peer:opacity-0">
              {projects.length}
            </span>
          )}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setConfirmOpen(true);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-[var(--text-muted)] transition-opacity hover:bg-[var(--bg-hover)] hover:text-[var(--accent-red)] pointer-events-none opacity-0 group-hover/peer:pointer-events-auto group-hover/peer:opacity-100"
          title={`Disconnect ${alias}`}
          aria-label={`Disconnect ${alias}`}
        >
          <XIcon />
        </button>
      </div>
      {!collapsed &&
        projects.map((project) => {
          const isSelected = selected === project.name;
          const cls = statusClass(project);
          const label = project.label || peerRawName(project.name);
          return (
            <button
              key={project.name}
              onClick={() => onSelect(project.name)}
              className={`${ROW_BASE_CLASS} ${
                isSelected
                  ? "bg-[var(--bg-active)] text-[var(--text-primary)]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              }`}
            >
              <StatusDot running={project.running} />
              <span className="truncate" title={label}>
                {cls ? <span className={cls}>{label}</span> : label}
              </span>
            </button>
          );
        })}

      <ConfirmDialog
        open={confirmOpen}
        title="Disconnect Mac"
        variant="destructive"
        confirmLabel="Remove"
        body={
          <>
            Disconnect from{" "}
            <span className="font-medium text-[var(--text-primary)]">{alias}</span>? Its projects
            will no longer appear here.
          </>
        }
        onCancel={() => setConfirmOpen(false)}
        onConfirm={confirmRemove}
      />
    </div>
  );
}
