import { archiveLocation, plural } from "../../projectArchive";
import { DEFAULT_SIDEBAR_NAV } from "../../sidebarNav";
import { useProjectArchiveStore } from "../../store/projectArchive";
import { useSettingsStore } from "../../store/settings";
import { ConfirmDialog } from "../ui/ConfirmDialog";

function copiesSentence(copies: number): string {
  return copies === 1
    ? "Its duplicate or worktree is archived with it."
    : `Its ${copies} duplicates and worktrees are archived with it.`;
}

/** Asks before a project is archived, saying what stops, what pauses, and
 *  where to bring it back from. */
export function ArchiveProjectDialog() {
  const asking = useProjectArchiveStore((s) => s.asking);
  const dismiss = useProjectArchiveStore((s) => s.dismiss);
  const confirm = useProjectArchiveStore((s) => s.confirm);
  const inSidebar = useSettingsStore((s) => s.sidebarNavInSidebar ?? DEFAULT_SIDEBAR_NAV);
  if (!asking) return null;

  const { label, preview, terminals } = asking;
  const stops = [
    preview.running ? "stops its services" : "",
    terminals > 0 ? `closes its ${plural(terminals, "terminal")}` : "",
  ].filter(Boolean);

  return (
    <ConfirmDialog
      open
      title={`Archive ${label}?`}
      confirmLabel={stops.length > 0 ? "Stop and archive" : "Archive"}
      onCancel={dismiss}
      onConfirm={() => void confirm()}
      body={
        <div className="flex flex-col gap-2">
          <p>
            <span className="font-medium text-[var(--text-primary)]">{label}</span> leaves the
            sidebar. Its setup, notes and folder stay as they are.
            {preview.copies > 0 && ` ${copiesSentence(preview.copies)}`}
          </p>
          {stops.length > 0 && <p>Archiving {stops.join(" and ")}.</p>}
          {preview.automations > 0 && (
            <p>
              {preview.automations === 1
                ? "Its automation pauses"
                : `Its ${preview.automations} automations pause`}{" "}
              until you unarchive it.
            </p>
          )}
          <p>
            You can unarchive it anytime from{" "}
            <span className="font-medium text-[var(--text-primary)]">
              {archiveLocation(inSidebar)}
            </span>
            .
          </p>
        </div>
      }
    />
  );
}
