import { useCallback, useMemo, useState } from "react";
import { useResizableWidth } from "../../hooks/useResizableWidth";
import { basename, joinAbs } from "../../path";
import { DiffConflictBanner } from "../review/DiffConflictBanner";
import { FilesEditor } from "./FilesEditor";
import { FilesHeader } from "./FilesHeader";
import type { RowTarget } from "./FilesRow";
import { FilesRowMenu } from "./FilesRowMenu";
import { FilesTree, type CursorRequest } from "./FilesTree";
import { rankFiles } from "./filesFilter";
import { ancestorsOf, flattenTree, type Item } from "./treeModel";
import { useDirListings } from "./useDirListings";
import { useFileBuffer } from "./useFileBuffer";
import { useFileIndex } from "./useFileIndex";

const TREE_WIDTH_KEY = "lpm:filesTreeWidth";
const TREE_OPEN_KEY = "lpm:filesTreeOpen";
const TREE_WIDTH_MIN = 180;
const TREE_WIDTH_MAX = 480;
const TREE_WIDTH_DEFAULT = 260;

interface FilesPaneProps {
  projectRoot: string;
  projectName: string;
  active: boolean;
}

// The Files tab (`kind: "files"`, like the review and toolkit tabs): the
// project tree on the right, one file in an editor on the left. Keyed by the
// project root where it is rendered, so every piece of state is per root.
export function FilesPane({ projectRoot, projectName, active }: FilesPaneProps) {
  const { listings, load, ensure, forget } = useDirListings(projectRoot, active);
  const buffer = useFileBuffer(projectRoot, active);
  const { open: openBuffer } = buffer;
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [query, setQuery] = useState("");
  const filtering = query.trim() !== "";
  const index = useFileIndex(projectRoot, filtering, active);
  const results = useMemo(
    () => (filtering && index ? rankFiles(index, query) : null),
    [filtering, index, query],
  );
  const rows = useMemo(() => flattenTree(listings, expanded), [listings, expanded]);
  const [treeOpen, setTreeOpen] = useState(() => localStorage.getItem(TREE_OPEN_KEY) !== "0");
  const [cursorRequest, setCursorRequest] = useState<CursorRequest | null>(null);
  const [menu, setMenu] = useState<RowTarget | null>(null);
  const { width: treeWidth, handleResizeStart } = useResizableWidth({
    initial: TREE_WIDTH_DEFAULT,
    min: TREE_WIDTH_MIN,
    max: TREE_WIDTH_MAX,
    edge: "left",
    storageKey: TREE_WIDTH_KEY,
  });

  const expandDirs = useCallback(
    (dirs: string[]) => {
      setExpanded((prev) => {
        if (dirs.every((dir) => prev.has(dir))) return prev;
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
        forget(path);
        return;
      }
      setExpanded((prev) => new Set(prev).add(path));
      void load(path);
    },
    [expanded, load, forget],
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

  // One rule for every list and menu: a file opens; a folder is revealed
  // while filtering and toggled otherwise.
  const activate = useCallback(
    (item: Item) => {
      if (!item.isDir) openFile(item.path);
      else if (filtering) revealDir(item.path);
      else toggleDir(item.path);
    },
    [filtering, openFile, revealDir, toggleDir],
  );

  const selectedPath = buffer.file?.path ?? null;
  const absPath = selectedPath ? joinAbs(projectRoot, selectedPath) : null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--bg-primary)]">
      <FilesHeader
        rootName={basename(projectRoot) || projectName}
        path={selectedPath}
        absPath={absPath}
        dirty={buffer.draft !== null}
        saving={buffer.saving}
        readOnly={buffer.readOnly}
        treeOpen={treeOpen}
        onSave={() => void buffer.save()}
        onRevealDir={revealDir}
        onToggleTree={() => showTree(!treeOpen)}
      />
      {buffer.conflict && (
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
            file={buffer.file}
            value={buffer.value}
            absPath={absPath ?? ""}
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
              onActivate={activate}
              onToggleDir={toggleDir}
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
          onOpen={() => activate(menu)}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
