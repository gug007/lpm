import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useResizableWidth } from "../../hooks/useResizableWidth";
import { basename, joinAbs } from "../../path";
import { useFilesFocus } from "../../store/filesFocus";
import { useSettingsStore } from "../../store/settings";
import { DiffConflictBanner } from "../review/DiffConflictBanner";
import { copyAbsolutePath, copyText, revealInFinder } from "./fileActions";
import { FilesEditor } from "./FilesEditor";
import { FilesHeader } from "./FilesHeader";
import type { RowTarget } from "./FilesRow";
import { FilesRowMenu } from "./FilesRowMenu";
import { FilesTree, type ActivateOptions, type CursorRequest } from "./FilesTree";
import { indexEntry, rankFiles, type IndexEntry } from "./filesFilter";
import { ancestorsOf, buildMatchTree, flattenTree, type Item } from "./treeModel";
import { useChangedFiles } from "./useChangedFiles";
import { useDirListings } from "./useDirListings";
import { useFileBuffer } from "./useFileBuffer";
import { useFileIndex } from "./useFileIndex";
import { useFilesChords } from "./useFilesChords";

const TREE_WIDTH_KEY = "lpm:filesTreeWidth";
const TREE_OPEN_KEY = "lpm:filesTreeOpen";
const CHANGES_ONLY_KEY = "lpm:filesChangesOnly";
const NO_ITEMS: IndexEntry[] = [];
const TREE_WIDTH_MIN = 180;
const TREE_WIDTH_MAX = 480;
const TREE_WIDTH_DEFAULT = 260;

interface FilesPaneProps {
  paneId: string;
  projectRoot: string;
  projectName: string;
  active: boolean;
  // The pane owns keyboard focus: the tab's chords fire only then.
  focused: boolean;
}

// The Files tab (`kind: "files"`, like the review and toolkit tabs): the
// project tree on the right, one file in an editor on the left. Keyed by the
// project root where it is rendered, so every piece of state is per root.
export function FilesPane({ paneId, projectRoot, projectName, active, focused }: FilesPaneProps) {
  const treeSide = useSettingsStore((s) => s.filesTreeSide ?? "right");
  const updateSettings = useSettingsStore((s) => s.update);
  const { listings, load, ensure, forget } = useDirListings(projectRoot, active);
  const buffer = useFileBuffer(projectRoot, active);
  const { open: openBuffer } = buffer;
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [query, setQuery] = useState("");
  const filtering = query.trim() !== "";
  // "Changes only" swaps the folder tree for the uncommitted files under their
  // folders, and the filter then ranks those instead of the project index.
  const [changesOnly, setChangesOnly] = useState(
    () => localStorage.getItem(CHANGES_ONLY_KEY) === "1",
  );
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const changes = useChangedFiles(projectRoot, changesOnly, active);
  const changeItems = useMemo<IndexEntry[] | null>(
    () =>
      changesOnly && changes.status === "ready"
        ? changes.files.map((f) => indexEntry(f.path, false))
        : null,
    [changesOnly, changes],
  );
  const index = useFileIndex(projectRoot, filtering && !changesOnly, active);
  const results = useMemo(() => {
    if (!filtering) return null;
    const source = changesOnly ? changeItems : index;
    return source ? rankFiles(source, query) : null;
  }, [filtering, changesOnly, changeItems, index, query]);
  const rows = useMemo(
    () =>
      changesOnly
        ? buildMatchTree(changeItems ?? NO_ITEMS, collapsed)
        : flattenTree(listings, expanded),
    [changesOnly, changeItems, collapsed, listings, expanded],
  );
  const [treeOpen, setTreeOpen] = useState(() => localStorage.getItem(TREE_OPEN_KEY) !== "0");
  const [cursorRequest, setCursorRequest] = useState<CursorRequest | null>(null);
  const [filterFocusRequest, setFilterFocusRequest] = useState(0);
  const [menu, setMenu] = useState<RowTarget | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const shownRef = useRef(buffer.file);
  shownRef.current = buffer.file;
  const cursorRef = useRef<Item | null>(null);
  const onCursorChange = useCallback((item: Item | null) => {
    cursorRef.current = item;
  }, []);
  const editorFocusPending = useRef(false);
  const { width: treeWidth, handleResizeStart } = useResizableWidth({
    initial: TREE_WIDTH_DEFAULT,
    min: TREE_WIDTH_MIN,
    max: TREE_WIDTH_MAX,
    // The handle sits on the edge that faces the editor.
    edge: treeSide === "left" ? "right" : "left",
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

  const uncollapse = useCallback((dirs: string[]) => {
    setCollapsed((prev) => {
      if (!dirs.some((dir) => prev.has(dir))) return prev;
      const next = new Set(prev);
      for (const dir of dirs) next.delete(dir);
      return next;
    });
  }, []);

  const toggleDir = useCallback(
    (path: string) => {
      if (changesOnly) {
        setCollapsed((prev) => {
          const next = new Set(prev);
          if (!next.delete(path)) next.add(path);
          return next;
        });
        return;
      }
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
    [changesOnly, expanded, load, forget],
  );

  const openFile = useCallback(
    (path: string) => {
      void openBuffer(path);
      expandDirs(ancestorsOf(path));
      uncollapse(ancestorsOf(path));
    },
    [openBuffer, expandDirs, uncollapse],
  );

  const showTree = useCallback((open: boolean) => {
    localStorage.setItem(TREE_OPEN_KEY, open ? "1" : "0");
    setTreeOpen(open);
  }, []);

  const showChangesOnly = useCallback((on: boolean) => {
    localStorage.setItem(CHANGES_ONLY_KEY, on ? "1" : "0");
    setChangesOnly(on);
  }, []);

  const focusFilter = useCallback(() => {
    showTree(true);
    setFilterFocusRequest((n) => n + 1);
  }, [showTree]);

  // Consumed in the same commit the tree acts on it, so a later remount of the
  // tree doesn't replay it.
  useEffect(() => {
    if (filterFocusRequest) setFilterFocusRequest(0);
  }, [filterFocusRequest]);

  const filterNonce = useFilesFocus((s) => s.filterNonce[paneId] ?? 0);
  useEffect(() => {
    if (!filterNonce) return;
    useFilesFocus.getState().clearFilter(paneId);
    focusFilter();
  }, [filterNonce, paneId, focusFilter]);

  const focusEditor = useCallback(() => {
    rootRef.current
      ?.querySelector<HTMLTextAreaElement>(".monaco-editor textarea.inputarea")
      ?.focus();
  }, []);

  // The editor for a file that had to load mounts in the same commit the
  // loaded file lands, so it can take focus here.
  useEffect(() => {
    if (!editorFocusPending.current || !buffer.file || buffer.file.loading) return;
    editorFocusPending.current = false;
    focusEditor();
  }, [buffer.file, focusEditor]);

  const focusTree = useCallback(() => {
    showTree(true);
    setCursorRequest((prev) => ({
      path: shownRef.current?.path ?? "",
      seq: (prev?.seq ?? 0) + 1,
    }));
  }, [showTree]);

  // Esc with nothing left for Monaco to cancel hands focus back to the tree.
  const onRootKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Escape") return;
    if (!(e.target instanceof Element) || !e.target.closest(".monaco-editor")) return;
    e.preventDefault();
    e.stopPropagation();
    focusTree();
  };

  // A breadcrumb or filter hit names a folder: open the tree on it.
  const revealDir = useCallback(
    (dir: string) => {
      setQuery("");
      showTree(true);
      const dirs = dir ? [...ancestorsOf(dir), dir] : [];
      if (changesOnly) uncollapse(dirs);
      else expandDirs(dirs);
      setCursorRequest((prev) => ({ path: dir, seq: (prev?.seq ?? 0) + 1 }));
    },
    [showTree, changesOnly, uncollapse, expandDirs],
  );

  // One rule for every list and menu: a file opens; a folder is revealed
  // while filtering and toggled otherwise.
  const activate = useCallback(
    (item: Item, opts?: ActivateOptions) => {
      if (item.isDir) {
        if (filtering) revealDir(item.path);
        else toggleDir(item.path);
        return;
      }
      openFile(item.path);
      if (!opts?.focusEditor) return;
      const shown = shownRef.current;
      if (shown?.path === item.path && !shown.loading) focusEditor();
      else editorFocusPending.current = true;
    },
    [filtering, openFile, revealDir, toggleDir, focusEditor],
  );

  const selectedPath = buffer.file?.path ?? null;
  const absPath = selectedPath ? joinAbs(projectRoot, selectedPath) : null;

  const stepFile = useCallback(
    (delta: 1 | -1) => {
      const items: Item[] = filtering ? (results ?? []) : rows;
      const files = items.filter((it) => !it.isDir);
      if (files.length === 0) return;
      const at = selectedPath ? files.findIndex((f) => f.path === selectedPath) : -1;
      const next =
        at < 0
          ? delta > 0
            ? 0
            : files.length - 1
          : Math.min(files.length - 1, Math.max(0, at + delta));
      openFile(files[next].path);
    },
    [filtering, results, rows, selectedPath, openFile],
  );

  // The path chords act on the tree cursor while the list has focus, else on
  // the open file; Reveal falls back to the project folder.
  const chordPath = () => cursorRef.current?.path ?? selectedPath;
  useFilesChords(active && focused, {
    save: () => void buffer.save(),
    nextFile: () => stepFile(1),
    prevFile: () => stepFile(-1),
    reveal: () => {
      const path = chordPath();
      void revealInFinder(path ? joinAbs(projectRoot, path) : projectRoot);
    },
    copyPath: () => {
      const path = chordPath();
      if (path) void copyAbsolutePath(joinAbs(projectRoot, path));
    },
    copyRelativePath: () => {
      const path = chordPath();
      if (path) void copyText(path);
    },
  });

  const rail = treeOpen && (
    <div
      className={`relative flex shrink-0 flex-col border-[var(--border)] ${
        treeSide === "left" ? "border-r" : "border-l"
      }`}
      style={{ width: treeWidth }}
    >
      <FilesTree
        rows={rows}
        rootListing={listings.get("")}
        changesOnly={changesOnly}
        onChangesOnlyChange={showChangesOnly}
        changes={changes}
        selectedPath={selectedPath}
        dirtyPaths={buffer.dirtyPaths}
        query={query}
        onQueryChange={setQuery}
        results={results}
        cursorRequest={cursorRequest}
        filterFocusRequest={filterFocusRequest}
        onActivate={activate}
        onToggleDir={toggleDir}
        onRowMenu={setMenu}
        onCursorChange={onCursorChange}
      />
      <div
        onMouseDown={handleResizeStart}
        aria-hidden
        className={`absolute inset-y-0 z-10 w-3 cursor-col-resize before:absolute before:inset-y-0 before:left-1/2 before:w-px before:-translate-x-1/2 hover:before:bg-[var(--accent-cyan)]/30 active:before:bg-[var(--accent-cyan)]/50 ${
          treeSide === "left" ? "-right-1.5" : "-left-1.5"
        }`}
      />
    </div>
  );

  return (
    <div
      ref={rootRef}
      onKeyDown={onRootKeyDown}
      className="flex h-full min-h-0 flex-col bg-[var(--bg-primary)]"
    >
      <FilesHeader
        rootName={basename(projectRoot) || projectName}
        path={selectedPath}
        absPath={absPath}
        dirty={buffer.draft !== null}
        saving={buffer.saving}
        readOnly={buffer.readOnly}
        treeOpen={treeOpen}
        treeSide={treeSide}
        onSave={() => void buffer.save()}
        onRevealDir={revealDir}
        onToggleTree={() => showTree(!treeOpen)}
        onTreeSide={(side) => void updateSettings({ filesTreeSide: side })}
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
        {treeSide === "left" && rail}
        <div className="relative min-w-0 flex-1">
          <FilesEditor
            file={buffer.file}
            value={buffer.value}
            absPath={absPath ?? ""}
            onChange={buffer.setDraft}
            onSave={() => void buffer.save()}
          />
        </div>
        {treeSide === "right" && rail}
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
