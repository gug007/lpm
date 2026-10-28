import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useContentZoom } from "../../hooks/useContentZoom";
import { useResizableWidth } from "../../hooks/useResizableWidth";
import { basename, joinAbs } from "../../path";
import type { RailView } from "../../store/filesView";
import { useSettingsStore } from "../../store/settings";
import { DiffConflictBanner } from "../review/DiffConflictBanner";
import { copyAbsolutePath, copyText, revealInFinder } from "./fileActions";
import { FilesAllChanges } from "./FilesAllChanges";
import { FilesDiscardDialog } from "./FilesDiscardDialog";
import { FilesEditor, type FileJump } from "./FilesEditor";
import { FilesHeader } from "./FilesHeader";
import type { RowTarget } from "./FilesRow";
import { FilesRowMenu } from "./FilesRowMenu";
import { underIgnored } from "./gitDecorations";
import { FilesTree, type ActivateOptions, type CursorRequest } from "./FilesTree";
import { rankFiles, type IndexEntry } from "./filesFilter";
import { FilesContentSearch } from "./FilesContentSearch";
import { FilesSearch } from "./FilesSearch";
import { FilesViewSwitch } from "./FilesViewSwitch";
import { selectedText } from "./editorSelection";
import { matchKey, type LineMatch } from "./fileSearch";
import {
  adjacentFile,
  ancestorsOf,
  buildMatchTree,
  flattenTree,
  ignoredPathsOf,
  type Item,
} from "./treeModel";
import { useChangesView } from "./useChangesView";
import { useCommitReview, type CommitReview } from "./useCommitReview";
import { useDirListings } from "./useDirListings";
import { useFileBuffer } from "./useFileBuffer";
import { useFileIndex } from "./useFileIndex";
import { useFileView } from "./useFileView";
import { useFilesPaneRequests } from "./useFilesPaneRequests";
import { useFilesChords } from "./useFilesChords";
import { useFilesSearch } from "./useFilesSearch";
import { useTreeEdits } from "./useTreeEdits";
import { useTreeExpansion } from "./useTreeExpansion";
import { FilesStart } from "./FilesStart";
import { useSelectedLineCounts } from "../../hooks/useSelectedLineCounts";
import type { ChangedFile } from "./useChangedFiles";

const TREE_WIDTH_KEY = "lpm:filesTreeWidth";
const CHANGES_ZOOM_KEY = "lpm:filesChangesZoom";
const NO_ITEMS: IndexEntry[] = [];
const NO_CHANGES: ChangedFile[] = [];
const NO_SELECTION: ReadonlySet<string> = new Set();
const TREE_WIDTH_MIN = 180;
const TREE_WIDTH_MAX = 480;
const TREE_WIDTH_DEFAULT = 260;

interface FilesPaneProps {
  tabId: string;
  paneId: string;
  projectRoot: string;
  projectName: string;
  active: boolean;
  // The pane owns keyboard focus: the tab's chords fire only then.
  focused: boolean;
  // Set when the pane is the commit dialog's review instead of a tab.
  review?: CommitReview;
}

// The Files tab (`kind: "files"`, like the review and toolkit tabs): the
// project tree on the right, one file in an editor on the left. Keyed by the
// project root where it is rendered, so every piece of state is per root.
export function FilesPane({
  tabId,
  paneId,
  projectRoot,
  projectName,
  active,
  focused,
  review,
}: FilesPaneProps) {
  const treeSide = useSettingsStore((s) => s.filesTreeSide ?? "right");
  const updateSettings = useSettingsStore((s) => s.update);
  const { listings, load, ensure, forget } = useDirListings(projectRoot, active);
  const buffer = useFileBuffer(projectRoot, active);
  const { open: openBuffer } = buffer;
  const [query, setQuery] = useState("");
  const filtering = query.trim() !== "";
  // Git status colours the tree; the git view swaps the folder tree for the
  // uncommitted files under their folders, and the filter then ranks those
  // instead of the project index.
  const selectedPath = buffer.file?.path ?? null;
  const git = useChangesView(projectRoot, selectedPath, active, !!review);
  const { changesOnly, decorations, showAllChanges } = git;
  const { expanded, collapsed, expandDirs, uncollapse, toggleDir } = useTreeExpansion(changesOnly, {
    load,
    ensure,
    forget,
  });
  const fileView = useFileView(selectedPath, git.diff, active && focused);
  const { showSource } = fileView;
  const commit = useCommitReview(git.files, buffer.dirtyPaths, review);
  const rootRef = useRef<HTMLDivElement>(null);
  const search = useFilesSearch(projectRoot, active);
  const { show: showSearch, hide: hideSearch } = search;
  const searching = search.open && !review;
  const railView: RailView = searching ? "search" : changesOnly ? "changes" : "files";
  const showRailView = (view: RailView) => {
    if (view === "search") return showSearch();
    hideSearch();
    git.showChangesOnly(view === "changes");
  };
  const seedSearch = useCallback(() => showSearch(selectedText(rootRef.current)), [showSearch]);
  const { treeOpen, showTree, filterFocusRequest } = useFilesPaneRequests(tabId, paneId, git, {
    view: railView,
    onSearch: seedSearch,
    onLeaveSearch: hideSearch,
  });
  // Where a search hit put the editor's cursor.
  const [jump, setJump] = useState<FileJump | null>(null);
  const { setWanted: setDiffWanted } = git.diff;
  // The stack of diffs zooms on its own; the shortcuts are taken only while it
  // is the focused pane's view, so ⌘+ elsewhere still sizes the terminal.
  const zoom = useContentZoom(active && focused && git.allChanges, CHANGES_ZOOM_KEY);
  const index = useFileIndex(projectRoot, filtering && !changesOnly, active);
  const ranked = useMemo(() => {
    if (!filtering) return null;
    const source = changesOnly ? git.items : index;
    return source ? rankFiles(source, query) : null;
  }, [filtering, changesOnly, git.items, index, query]);
  // Apart, so a folder listing refreshing under the git view leaves its rows be.
  const changeRows = useMemo(() => buildMatchTree(git.items ?? NO_ITEMS, collapsed), [git.items, collapsed]);
  const folderRows = useMemo(() => flattenTree(listings, expanded), [listings, expanded]);
  const rows = changesOnly ? changeRows : folderRows;
  const startShown = !buffer.file && !git.allChanges && git.files.length > 0;
  const startLines = useSelectedLineCounts(projectRoot, startShown ? git.files : NO_CHANGES, NO_SELECTION).byPath;
  const ignoredPaths = useMemo(() => ignoredPathsOf(listings), [listings]);
  // Which file the diff stack is scrolled to, so the rail follows the reading.
  const [stackPath, setStackPath] = useState<string | null>(null);
  const [cursorRequest, setCursorRequest] = useState<CursorRequest | null>(null);
  const [menu, setMenu] = useState<RowTarget | null>(null);
  const [splitFits, setSplitFits] = useState(true);
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

  // A file opened from the git view opens as its diff; one opened at a
  // search hit, as its source.
  const openFile = useCallback(
    (path: string, asSource = false) => {
      void openBuffer(path);
      setJump(null);
      setDiffWanted(changesOnly && !asSource);
      showSource(asSource ? path : null);
      showAllChanges(false);
      expandDirs(ancestorsOf(path));
      uncollapse(ancestorsOf(path));
    },
    [openBuffer, changesOnly, setDiffWanted, showSource, showAllChanges, expandDirs, uncollapse],
  );

  // The match comes selected; only Enter moves on to the editor.
  const openMatch = useCallback(
    (path: string, match: LineMatch, focus: boolean) => {
      openFile(path, true);
      setJump({ path, line: match.line, col: match.col, endCol: match.col + match.len, focus });
    },
    [openFile],
  );

  const openChange = useCallback(
    (path: string) => {
      openFile(path);
      setDiffWanted(true);
    },
    [openFile, setDiffWanted],
  );

  // A diff editor has two inputs; the editable one comes last. A preview has
  // none and takes the focus itself, so keys scroll it.
  const focusEditor = useCallback(() => {
    const inputs = rootRef.current?.querySelectorAll<HTMLElement>(
      ".monaco-editor textarea.inputarea, [data-files-preview]",
    );
    inputs?.[inputs.length - 1]?.focus();
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
    if (searching) return showSearch();
    setCursorRequest((prev) => ({
      path: shownRef.current?.path ?? "",
      seq: (prev?.seq ?? 0) + 1,
    }));
  }, [showTree, searching, showSearch]);

  // Esc with nothing left for Monaco to cancel hands focus back to the tree.
  const onRootKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Escape") return;
    if (!(e.target instanceof Element)) return;
    if (!e.target.closest(".monaco-editor, [data-files-preview]")) return;
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

  const absPath = selectedPath ? joinAbs(projectRoot, selectedPath) : null;
  const edits = useTreeEdits({
    root: projectRoot,
    projectName,
    listings,
    load,
    expandDirs,
    setQuery,
    showChangesOnly: git.showChangesOnly,
    openFile,
    selectedPath,
    dirtyPaths: buffer.dirtyPaths,
  });

  const stepFile = useCallback(
    (delta: 1 | -1) => {
      const next = adjacentFile(filtering ? (ranked?.entries ?? []) : rows, selectedPath, delta);
      if (next) openFile(next);
    },
    [filtering, ranked, rows, selectedPath, openFile],
  );

  // The path chords act on the tree cursor while the list has focus, else on
  // the open file; Reveal falls back to the project folder.
  const chordPath = () => cursorRef.current?.path ?? selectedPath;
  useFilesChords(active && focused, {
    save: () => void buffer.save(),
    togglePreview: fileView.togglePreview,
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
  }, rootRef);

  const rail = treeOpen && (
    <div
      className={`relative flex shrink-0 flex-col border-[var(--border)] ${
        treeSide === "left" ? "border-r" : "border-l"
      }`}
      // A narrow (split) pane still leaves the editor most of the width.
      style={{ width: treeWidth, maxWidth: "45%" }}
    >
      {!review && (
        <FilesViewSwitch
          view={railView}
          count={git.changes.status === "ready" ? git.changes.files.length : null}
          onChange={showRailView}
        />
      )}
      {searching ? (
        <FilesSearch
          search={search}
          openedKey={jump ? matchKey(jump.path, jump) : null}
          onOpen={openMatch}
          unsaved={buffer.dirtyPaths}
        />
      ) : (
        <FilesTree
          rows={rows}
          rootListing={listings.get("")}
          changes={git.changes}
          decorations={decorations}
          ignoredPaths={ignoredPaths}
          changesOnly={changesOnly}
          allChanges={git.allChanges}
          onAllChangesChange={showAllChanges}
          selectedPath={git.allChanges ? stackPath : selectedPath}
          dirtyPaths={commit.dirtyPaths}
          query={query}
          onQueryChange={setQuery}
          results={ranked?.entries ?? null}
          resultsTotal={ranked?.total}
          noMatches={review ? undefined : <FilesContentSearch query={query} onSearch={showSearch} />}
          cursorRequest={cursorRequest}
          filterFocusRequest={filterFocusRequest}
          onActivate={activate}
          onToggleDir={toggleDir}
          onRowMenu={setMenu}
          onDiscard={git.discard.request}
          checks={commit.checks}
          onCheck={commit.onCheck}
          onCursorChange={onCursorChange}
          edits={review ? undefined : edits}
        />
      )}
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
        status={git.status}
        view={fileView.view}
        viewOptions={fileView.options}
        onView={fileView.select}
        allChanges={git.allChanges}
        zoom={git.allChanges ? zoom : fileView.previewing ? fileView.zoom : null}
        sideBySide={git.sideBySide}
        canSplit={splitFits}
        onSideBySide={git.showSideBySide}
        wordWrap={git.wordWrap}
        onWordWrap={git.showWordWrap}
        dirty={buffer.draft !== null}
        saving={buffer.saving}
        readOnly={buffer.readOnly}
        treeOpen={treeOpen}
        treeSide={treeSide}
        onSave={() => void buffer.save()}
        onRevealDir={revealDir}
        onToggleTree={() => showTree(!treeOpen)}
        onTreeSide={(side) => void updateSettings({ filesTreeSide: side })}
        onClose={review?.onClose}
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
        <div ref={zoom.surfaceRef} className="relative min-w-0 flex-1">
          {git.stackMounted && (
            <div className={git.allChanges ? "h-full" : "hidden"}>
              <FilesAllChanges
                projectRoot={projectRoot}
                files={git.files}
                zoom={zoom.zoom}
                sideBySide={git.sideBySide}
                wordWrap={git.wordWrap}
                active={active && git.allChanges}
                onActiveFileChange={setStackPath}
                authority={review ? "commit" : "files"}
                selected={review?.selected}
                onDirtyPathsChange={commit.onStackDirty}
                onSplitFitsChange={setSplitFits}
              />
            </div>
          )}
          {startShown && (
            <FilesStart
              files={git.files}
              lineCounts={startLines}
              onOpen={openChange}
              onReviewAll={() => {
                git.showChangesOnly(true);
                showAllChanges(true);
              }}
            />
          )}
          {!git.allChanges && !startShown && (
            <FilesEditor
              file={buffer.file}
              value={buffer.value}
              absPath={absPath ?? ""}
              diff={git.diff.diff}
              markdown={
                fileView.previewing
                  ? { zoom: fileView.zoom, projectRoot, onOpenFile: openFile }
                  : null
              }
              onChange={buffer.setDraft}
              onSave={() => void buffer.save()}
              jump={jump}
            />
          )}
        </div>
        {treeSide === "right" && rail}
      </div>
      {menu && (
        <FilesRowMenu
          target={menu}
          absPath={joinAbs(projectRoot, menu.path)}
          projectName={projectName}
          onOpen={() => activate(menu)}
          edits={review ? undefined : edits}
          onDiscard={decorations.has(menu.path) ? () => git.discard.request(menu) : undefined}
          ignored={underIgnored(menu.path, ignoredPaths)}
          onClose={() => setMenu(null)}
        />
      )}
      <FilesDiscardDialog
        target={git.discard.target}
        busy={git.discard.busy}
        onCancel={git.discard.cancel}
        onConfirm={() => void git.discard.confirm()}
        zIndexClassName={review?.dialogZIndexClassName}
      />
    </div>
  );
}
