import { useState } from "react";
import { agentBusy } from "../autoPullRun";
import { mergedOfferText, offeredCopies, removeCopiesLabel } from "../mergedCopies";
import { useMergedCopies } from "../store/mergedCopies";
import type { ProjectInfo } from "../types";
import { BatchDeleteDialog } from "./BatchDeleteDialog";
import { projectDisplayName } from "./ProjectNameDisplay";

interface SidebarMergedOfferProps {
  projects: ProjectInfo[];
  projectByName: Map<string, ProjectInfo>;
  removingNames: Set<string>;
  onRemove: (names: string[]) => void;
}

const PRIMARY =
  "rounded-md bg-[var(--text-primary)] px-2.5 py-1 text-[11px] font-medium text-[var(--bg-primary)] transition-opacity hover:opacity-85";
const SECONDARY =
  "rounded-md border border-[var(--border)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-active)]";

// Above the sidebar's footer once copies have landed: remove them together, or
// stop being asked about them.
export function SidebarMergedOffer({ projects, projectByName, removingNames, onRemove }: SidebarMergedOfferProps) {
  const entries = useMergedCopies((s) => s.entries);
  const dismissed = useMergedCopies((s) => s.dismissed);
  const dismiss = useMergedCopies((s) => s.dismiss);
  const [confirming, setConfirming] = useState<ProjectInfo[]>([]);

  const offered = offeredCopies(projects, {
    entries,
    dismissed,
    skip: (p) => removingNames.has(p.name) || agentBusy(p),
  });

  const parents = new Set(offered.map((p) => p.parentName));
  const [only] = parents;
  const parent = parents.size === 1 && only ? projectByName.get(only) : undefined;
  const text = mergedOfferText(offered, parent ? projectDisplayName(parent) : null);

  return (
    <>
      {offered.length > 0 && (
        <div className="mx-2 mb-2 grid gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2.5">
          <p className="text-xs text-[var(--text-primary)]">{text}</p>
          <div className="flex gap-2">
            <button type="button" className={PRIMARY} onClick={() => setConfirming(offered)}>
              {removeCopiesLabel(offered.length)}
            </button>
            <button
              type="button"
              className={SECONDARY}
              onClick={() => dismiss(offered.map((p) => ({ name: p.name, number: entries[p.root].number })))}
            >
              Not now
            </button>
          </div>
        </div>
      )}
      <BatchDeleteDialog
        open={confirming.length > 0}
        projects={confirming}
        projectByName={projectByName}
        merged
        onCancel={() => setConfirming([])}
        onConfirm={() => {
          onRemove(confirming.map((p) => p.name));
          setConfirming([]);
        }}
      />
    </>
  );
}
