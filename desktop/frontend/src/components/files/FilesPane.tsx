import { useCallback, useMemo, useState, type KeyboardEvent } from "react";
import { useResizableWidth } from "../../hooks/useResizableWidth";
import { basename, joinAbs } from "../../path";
import { useAppStore } from "../../store/app";
import { DiffConflictBanner } from "../review/DiffConflictBanner";
import { FilesEditor } from "./FilesEditor";
import { FilesHeader } from "./FilesHeader";
import { FilesRowMenu } from "./FilesRowMenu";
import { FilesTree, type CursorRequest } from "./FilesTree";
import type { RowTarget } from "./FilesTreeRow";
import { rankFiles } from "./filesFilter";
import { ancestorsOf, flattenTree } from "./treeModel";
import { useDirListings } from "./useDirListings";
import { useFileBuffer } from "./useFileBuffer";
import { useFileIndex } from "./useFileIndex";

const TREE_WIDTH_KEY = "lpm:filesTreeWidth";
const TREE_OPEN_KEY = "lpm:filesTreeOpen";
const TREE_WIDTH_MIN = 180;
const TREE_WIDTH_MAX = 480;
const TREE_WIDTH_DEFAULT = 260;

interface FilesPaneProps {
  tabId: string;
  projectRoot: string;
  projectName: string;
  active: boolean;
}

// The Files tab (`kind: "files"`, like the review and toolkit tabs): the
// project tree on the right, one file in an editor on the left.
export function FilesPane({ tabId, projectRoot, projectName, active }: FilesPaneProps) {
  // An SSH host's files are read through the host; nothing writes them yet.
  const readOnly = useAppStore(
    (s) => s.projects.find((p) => p.name === projectName)?.isRemote ?? false,
  );
  const { listings, load, ensure } = useDirListings(projectRoot, active);
  const buffer = useFileBuffer(projectRoot, active, readOnly);
  const { open: openBuffer } = buffer;
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [query, setQuery] = useState("");
  const filtering = query.trim() !== "";
  const { index } = useFileIndex(projectRoot, filtering);
  const results = useMemo(
    () => (filtering && index ? rankFiles(index, query) : null),
    [filtering, index, query],
  );
  const rows = useMemo(() => flattenTree(listings, expanded), [listings, expanded]);
  const [treeOpen, setTreeOpen] = useState(() => localStorage.getItem(TREE_OPEN_KEY) !== "0");
  const [cursorRequest, setCursorRequest] = useState<CursorRequest | null>(null);
  const [menu, setMenu] = useState<RowTarget | null>(null);
  const { width: treeWidth, handleResizeStart } = useResizableWidth({
    initial: () => {
      const v = Number(localStorage.getItem(TREE_WIDTH_KEY));
      return v >= TREE_WIDTH_MIN && v <= TREE_WIDTH_MAX ? v : TREE_WIDTH_DEFAULT;
    },
    min: TREE_WIDTH_MIN,
    max: TREE_WIDTH_MAX,
    edge: "left",
    onCommit: (w) => localStorage.setItem(TREE_WIDTH_KEY, String(w)),
  });

  const expandDirs = useCallback(
    (dirs: string[]) => {
      if (dirs.length === 0) return;
      setExpanded((prev) => {
        const next = new Set(prev);
        for (const dir of dirs) next.add(dir);
        return next;
      });
      for (const dir of dirs) ensure(dir);
    },
    [ensure],
  );

  const toggleDir = useCallback(
    (path: string) => {
      if (expanded.has(path)) {
        setExpanded((prev) => {
          const next = new Set(prev);
          next.delete(path);
          return next;
        });
        return;
      }
      setExpanded((prev) => new Set(prev).add(path));
      // Opening a folder re-lists it: the natural way to refresh a folder the
      // watcher ignores (dependencies, build output).
      void load(path);
    },
    [expanded, load],
  );

  const openFile = useCallback(
    (path: string) => {
      void openBuffer(path);
      expandDirs(ancestorsOf(path));
    },
    [openBuffer, expandDirs],
  );

  const showTree = useCallback((open: boolean) => {
    localStorage.setItem(TREE_OPEN_KEY, open ? "1" : "0");
    setTreeOpen(open);
  }, []);

  // A breadcrumb or filter hit names a folder: open the tree on it.
  const revealDir = useCallback(
    (dir: string) => {
      setQuery("");
      showTree(true);
      expandDirs(dir ? [...ancestorsOf(dir), dir] : []);
      setCursorRequest((prev) => ({ path: dir, seq: (prev?.seq ?? 0) + 1 }));
    },
    [showTree, expandDirs],
  );

  const onKeyDownCapture = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "s") {
      e.preventDefault();
      e.stopPropagation();
      void buffer.save();
    }
  };

  const selectedPath = buffer.file?.path ?? null;
  const absPath = selectedPath ? joinAbs(projectRoot, selectedPath) : null;

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-[var(--bg-primary)]"
      onKeyDownCapture={onKeyDownCapture}
    >
      <FilesHeader
        rootName={basename(projectRoot) || projectName}
        path={selectedPath}
        absPath={absPath}
        dirty={buffer.draft !== null}
        saving={buffer.saving}
        readOnly={readOnly}
        treeOpen={treeOpen}
        onSave={() => void buffer.save()}
        onRevealDir={revealDir}
        onToggleTree={() => showTree(!treeOpen)}
      />
      {buffer.conflict && !readOnly && (
        <DiffConflictBanner
          path={buffer.conflict.path}
          onOverwrite={() => void buffer.resolveConflict("overwrite")}
          onUseTheirs={() => void buffer.resolveConflict("theirs")}
          onDismiss={() => void buffer.resolveConflict("dismiss")}
        />
      )}
      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          <FilesEditor
            instanceId={tabId}
            file={buffer.file}
            value={buffer.value}
            absPath={absPath ?? ""}
            active={active}
            readOnly={readOnly}
            onChange={buffer.setDraft}
            onSave={() => void buffer.save()}
          />
        </div>
        {treeOpen && (
          <div
            className="relative flex shrink-0 flex-col border-l border-[var(--border)]"
            style={{ width: treeWidth }}
          >
            <FilesTree
              rows={rows}
              rootListing={listings.get("")}
              selectedPath={selectedPath}
              dirtyPaths={buffer.dirtyPaths}
              query={query}
              onQueryChange={setQuery}
              results={results}
              cursorRequest={cursorRequest}
              onToggleDir={toggleDir}
              onOpenFile={openFile}
              onRevealDir={revealDir}
              onRowMenu={setMenu}
            />
            <div
              onMouseDown={handleResizeStart}
              aria-hidden
              className="absolute inset-y-0 -left-1.5 z-10 w-3 cursor-col-resize before:absolute before:inset-y-0 before:left-1/2 before:w-px before:-translate-x-1/2 hover:before:bg-[var(--accent-cyan)]/30 active:before:bg-[var(--accent-cyan)]/50"
            />
          </div>
        )}
      </div>
      {menu && (
        <FilesRowMenu
          target={menu}
          absPath={joinAbs(projectRoot, menu.path)}
          onOpen={() => {
            if (!menu.isDir) openFile(menu.path);
            else if (filtering) revealDir(menu.path);
            else toggleDir(menu.path);
          }}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
