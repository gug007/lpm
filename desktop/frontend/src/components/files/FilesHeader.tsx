import { Fragment, useLayoutEffect, useRef, useState } from "react";
import { PanelRight, PanelRightClose } from "lucide-react";
import { ChevronRightIcon } from "../icons";
import { OpenFileWithDropdown } from "../OpenFileWithDropdown";
import { Tooltip } from "../ui/Tooltip";
import { ancestorsOf, baseName } from "./treeModel";

interface FilesHeaderProps {
  rootName: string;
  path: string | null;
  absPath: string | null;
  dirty: boolean;
  saving: boolean;
  readOnly: boolean;
  treeOpen: boolean;
  onSave: () => void;
  onRevealDir: (dir: string) => void;
  onToggleTree: () => void;
}

const CRUMB_CLASS =
  "shrink-0 rounded px-1 py-0.5 text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]";

// The row above the editor: the open file's path as clickable folders, then
// the actions on it.
export function FilesHeader({
  rootName,
  path,
  absPath,
  dirty,
  saving,
  readOnly,
  treeOpen,
  onSave,
  onRevealDir,
  onToggleTree,
}: FilesHeaderProps) {
  const navRef = useRef<HTMLElement>(null);
  const trailRef = useRef<HTMLDivElement>(null);
  const [tight, setTight] = useState(false);

  // When the trail outgrows the header, anchor it to its end so the file name,
  // not the project name, is what survives the clipping.
  useLayoutEffect(() => {
    const nav = navRef.current;
    const trail = trailRef.current;
    if (!nav || !trail) return;
    const measure = () => setTight(trail.offsetWidth > nav.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    observer.observe(trail);
    return () => observer.disconnect();
  }, []);

  const folders = path ? ancestorsOf(path) : [];
  const treeLabel = treeOpen ? "Hide file tree" : "Show file tree";

  return (
    <div className="flex h-10 shrink-0 items-center gap-2 border-b border-[var(--border)] bg-[var(--bg-secondary)]/20 px-2">
      <nav
        ref={navRef}
        aria-label="File path"
        className={`flex min-w-0 flex-1 items-center overflow-hidden ${tight ? "justify-end" : ""}`}
      >
        <div ref={trailRef} className="flex shrink-0 items-center whitespace-nowrap">
          <button
            type="button"
            onClick={() => onRevealDir("")}
            className={CRUMB_CLASS}
            title="Show the project root"
          >
            {rootName}
          </button>
          {folders.map((dir) => (
            <Fragment key={dir}>
              <Separator />
              <button
                type="button"
                onClick={() => onRevealDir(dir)}
                className={CRUMB_CLASS}
                title={dir}
              >
                {baseName(dir)}
              </button>
            </Fragment>
          ))}
          <Separator />
          {path ? (
            <span className="flex shrink-0 items-center gap-1.5 px-1 text-xs font-medium text-[var(--text-primary)]">
              {baseName(path)}
              {dirty && (
                <span
                  className="h-1.5 w-1.5 rounded-full bg-[var(--accent-cyan)]"
                  title="Unsaved changes"
                />
              )}
            </span>
          ) : (
            <span className="shrink-0 px-1 text-xs text-[var(--text-muted)]">Select a file</span>
          )}
        </div>
      </nav>
      {readOnly && path && (
        <span
          className="shrink-0 rounded bg-[var(--bg-hover)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)]"
          title="Files on an SSH host open read-only"
        >
          Read-only
        </span>
      )}
      {dirty && !readOnly && (
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="shrink-0 rounded-md bg-[var(--text-primary)] px-3 py-1 text-[11px] font-medium text-[var(--bg-primary)] transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      )}
      {absPath && <OpenFileWithDropdown absPath={absPath} line={0} col={0} compact />}
      <div className="h-4 w-px shrink-0 bg-[var(--border)]" />
      <Tooltip content={treeLabel} side="bottom">
        <button
          type="button"
          onClick={onToggleTree}
          aria-label={treeLabel}
          aria-pressed={treeOpen}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          {treeOpen ? (
            <PanelRightClose size={14} strokeWidth={1.75} />
          ) : (
            <PanelRight size={14} strokeWidth={1.75} />
          )}
        </button>
      </Tooltip>
    </div>
  );
}

function Separator() {
  return (
    <span aria-hidden className="shrink-0 text-[var(--text-muted)] opacity-60 [&>svg]:h-3 [&>svg]:w-3">
      <ChevronRightIcon />
    </span>
  );
}
