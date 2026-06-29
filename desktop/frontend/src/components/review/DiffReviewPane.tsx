import { useCallback, useEffect, useRef, useState } from "react";
import type * as monacoNs from "monaco-editor";
import { toast } from "sonner";
import { GitDefaultBranch, WriteFileIfUnchanged } from "../../../bridge/commands";
import { main } from "../../../bridge/models";
import { joinAbs } from "../../path";
import { setupMonaco } from "../../monaco-setup";
import {
  DEFAULT_MONACO_FONT_SIZE,
  MONACO_FONT_FAMILY,
  currentMonacoTheme,
  defineMonacoThemes,
  observeMonacoTheme,
} from "../../monaco-theme";
import { getSettings } from "../../store/settings";
import { useReviewFiles } from "../../hooks/useReviewFiles";
import { useGitChanged } from "../../hooks/useGitChanged";
import { useResizableWidth } from "../../hooks/useResizableWidth";
import { SegmentedControl } from "../ui/SegmentedControl";
import { MonacoDiffPool, type MonacoDiffPoolHandle } from "./MonacoDiffPool";
import { ChevronLeftIcon, RefreshIcon, FileIcon } from "../icons";
import { Tooltip } from "../ui/Tooltip";
import { BinaryFilePlaceholder } from "./BinaryFilePlaceholder";
import { DiffConflictBanner } from "./DiffConflictBanner";
import { DiffFileTree } from "./DiffFileTree";
import { DiffSourceModeToggle } from "./DiffSourceModeToggle";
import { DiffZoomControl } from "./DiffZoomControl";
import { REVIEW_SOURCES, type FileDiffResult, type ReviewMode } from "./reviewSource";

type Monaco = typeof monacoNs;
type ChangedFile = main.ChangedFile;
type DiffModels = {
  original: monacoNs.editor.ITextModel;
  modified: monacoNs.editor.ITextModel;
};
type FileEntry = {
  models: DiffModels | null;
  mode: ReviewMode;
  path: string;
  // The exact on-disk string the backend reads (from_utf8_lossy) — used as the
  // CAS expected_content and the git-changed echo comparison.
  diskBaseline: string;
  // Monaco's alternative version id at the last clean point. Dirty is derived
  // from edit history, not string equality, so a file whose model getValue()
  // diverges from disk bytes (mixed EOL, lossy decode) is never falsely dirty
  // and so is never silently rewritten by a no-edit save.
  cleanVersionId: number;
  original: string;
  dirty: boolean;
  editable: boolean;
  binary: boolean;
};

const EMPTY_DIRTY: Set<string> = new Set();
const TREE_WIDTH_KEY = "lpm:reviewTreeWidth";
const TREE_WIDTH_MIN = 180;
const TREE_WIDTH_MAX = 480;
const FONT_SIZE_KEY = "lpm:reviewFontSize";
const FONT_SIZE_MIN = 8;
const FONT_SIZE_MAX = 32;
// Wheel delta accumulated per one-point font step during ⌘/pinch zoom.
const ZOOM_WHEEL_STEP = 40;
const VIEW_OPTIONS = [
  { value: "split", label: "Split" },
  { value: "unified", label: "Unified" },
] as const;
const PANE_VIEW_OPTIONS = [
  { value: "all", label: "All files" },
  { value: "single", label: "Single" },
] as const;
type PaneViewMode = "single" | "all";

// Cache + view-state are scoped per (mode, path): the same path has different
// content under working / vs-base / staged.
const keyOf = (mode: ReviewMode, path: string) => `${mode} ${path}`;

interface DiffReviewPaneProps {
  projectRoot: string;
  // When the pane is a DetailView, this returns to the terminal. As a pane tab
  // it is omitted — the tab's own close control handles dismissal.
  onBack?: () => void;
  // False while the pane tab is open but not visible — pauses git polling so a
  // hidden review tab does no background work. Defaults to active.
  active?: boolean;
}

function makeModels(
  monaco: Monaco,
  mode: ReviewMode,
  path: string,
  original: string,
  modified: string,
): DiffModels {
  const make = (side: string, value: string) => {
    const uri = monaco.Uri.from({
      scheme: "lpm-diff",
      authority: "review",
      path: `/${path}`,
      query: `mode=${mode}&side=${side}`,
    });
    monaco.editor.getModel(uri)?.dispose();
    return monaco.editor.createModel(value, undefined, uri);
  };
  return { original: make("original", original), modified: make("modified", modified) };
}

export function DiffReviewPane({
  projectRoot,
  onBack,
  active = true,
}: DiffReviewPaneProps) {
  const [mode, setMode] = useState<ReviewMode>("working");
  const [baseBranch, setBaseBranch] = useState("");
  const { files, refresh } = useReviewFiles(projectRoot, mode, baseBranch, active);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [binaryPath, setBinaryPath] = useState<string | null>(null);
  const [sideBySide, setSideBySide] = useState(true);
  const [viewMode, setViewMode] = useState<PaneViewMode>("all");
  const [ready, setReady] = useState(false);
  const [dirtyPaths, setDirtyPaths] = useState<Set<string>>(new Set());
  const [conflict, setConflict] = useState<{ path: string; theirs: string } | null>(
    null,
  );

  // Zoom = shared diff font size across the single editor and the all-files pool,
  // persisted across sessions; 100% is the configured editor font size.
  const baseFontSize = getSettings().editorFontSize || DEFAULT_MONACO_FONT_SIZE;
  const [fontSize, setFontSize] = useState(() => {
    const v = Number(localStorage.getItem(FONT_SIZE_KEY));
    return v >= FONT_SIZE_MIN && v <= FONT_SIZE_MAX ? v : baseFontSize;
  });

  const { width: treeWidth, handleResizeStart } = useResizableWidth({
    initial: () => {
      const v = Number(localStorage.getItem(TREE_WIDTH_KEY));
      return v >= TREE_WIDTH_MIN && v <= TREE_WIDTH_MAX ? v : 256;
    },
    min: TREE_WIDTH_MIN,
    max: TREE_WIDTH_MAX,
    onCommit: (w) => localStorage.setItem(TREE_WIDTH_KEY, String(w)),
  });

  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monacoNs.editor.IStandaloneDiffEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const cacheRef = useRef<Map<string, FileEntry>>(new Map());
  const displayedRef = useRef<string | null>(null);
  const viewStateRef = useRef<Map<string, monacoNs.editor.IDiffEditorViewState>>(
    new Map(),
  );
  const suppressChangeRef = useRef(false);
  const savingRef = useRef(false);
  const reqRef = useRef(0);
  const filesRef = useRef<ChangedFile[]>([]);
  const baseRef = useRef("");
  const modeRef = useRef<ReviewMode>(mode);
  const activeRef = useRef(active);
  const stackRef = useRef<MonacoDiffPoolHandle>(null);
  const saveRef = useRef<() => void>(() => {});
  const rootRef = useRef<HTMLDivElement>(null);
  const fontSizeRef = useRef(fontSize);
  const wheelAccumRef = useRef(0);
  filesRef.current = files;
  baseRef.current = baseBranch;
  modeRef.current = mode;
  activeRef.current = active;
  fontSizeRef.current = fontSize;

  const statusOf = useCallback(
    (path: string) => filesRef.current.find((f) => f.path === path)?.status,
    [],
  );

  // The single editability predicate, used by selection, reconcile, save, and
  // render alike. Only the working tree is ever writable.
  const isEditable = useCallback(
    (m: ReviewMode, path: string, binary: boolean) =>
      REVIEW_SOURCES[m].editable && !binary && statusOf(path) !== "deleted",
    [statusOf],
  );

  const fetchDiff = useCallback(
    (m: ReviewMode, path: string): Promise<FileDiffResult> =>
      REVIEW_SOURCES[m].fetchDiff(projectRoot, path, baseRef.current),
    [projectRoot],
  );

  const zoomBy = useCallback((delta: number) => {
    setFontSize((f) => Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, f + delta)));
  }, []);
  const zoomReset = useCallback(() => setFontSize(baseFontSize), [baseFontSize]);

  const withSuppressed = useCallback((fn: () => void) => {
    suppressChangeRef.current = true;
    try {
      fn();
    } finally {
      suppressChangeRef.current = false;
    }
  }, []);

  const setDirty = useCallback((path: string, dirty: boolean) => {
    setDirtyPaths((prev) => {
      if (dirty === prev.has(path)) return prev;
      const next = new Set(prev);
      if (dirty) next.add(path);
      else next.delete(path);
      return next;
    });
  }, []);

  const markClean = useCallback(
    (entry: FileEntry, baseline: string) => {
      if (!entry.models) return;
      entry.diskBaseline = baseline;
      entry.cleanVersionId = entry.models.modified.getAlternativeVersionId();
      entry.dirty = false;
      setDirty(entry.path, false);
    },
    [setDirty],
  );

  const persistViewState = useCallback(() => {
    const editor = editorRef.current;
    const key = displayedRef.current;
    if (!editor || !key) return;
    const state = editor.saveViewState();
    if (state) viewStateRef.current.set(key, state);
  }, []);

  const restoreViewState = useCallback((key: string, token: number) => {
    const saved = viewStateRef.current.get(key);
    if (!saved) return;
    // automaticLayout is async; restoring synchronously after setModel/setValue
    // can snap back to the top, so defer a frame.
    requestAnimationFrame(() => {
      if (reqRef.current !== token || displayedRef.current !== key) return;
      editorRef.current?.restoreViewState(saved);
    });
  }, []);

  const swapTo = useCallback(
    (key: string, entry: FileEntry, token: number) => {
      const editor = editorRef.current;
      if (!editor) return;
      persistViewState();
      if (entry.binary || !entry.models) {
        withSuppressed(() => editor.setModel(null));
        setBinaryPath(entry.binary ? entry.path : null);
      } else {
        const models = entry.models;
        withSuppressed(() => {
          editor.setModel({ original: models.original, modified: models.modified });
          editor.updateOptions({ readOnly: !entry.editable });
        });
        setBinaryPath(null);
      }
      const prev = displayedRef.current;
      displayedRef.current = key;
      // Bound memory: drop a clean file's models when navigating away (it
      // refetches cheaply on return); dirty files stay so unsaved edits survive.
      if (prev && prev !== key) {
        const prevEntry = cacheRef.current.get(prev);
        if (prevEntry && !prevEntry.dirty && !prevEntry.binary && prevEntry.models) {
          prevEntry.models.original.dispose();
          prevEntry.models.modified.dispose();
          cacheRef.current.delete(prev);
        }
      }
      if (!entry.binary && entry.models) restoreViewState(key, token);
    },
    [persistViewState, restoreViewState, withSuppressed],
  );

  const selectFile = useCallback(
    async (path: string | null) => {
      const editor = editorRef.current;
      const monaco = monacoRef.current;
      if (!editor || !monaco) return;

      if (!path) {
        persistViewState();
        withSuppressed(() => editor.setModel(null));
        displayedRef.current = null;
        setBinaryPath(null);
        return;
      }

      const m = modeRef.current;
      const key = keyOf(m, path);
      const token = ++reqRef.current;
      const cached = cacheRef.current.get(key);
      if (cached) {
        swapTo(key, cached, token);
        return;
      }

      let diff: FileDiffResult;
      try {
        diff = await fetchDiff(m, path);
      } catch {
        return;
      }
      if (token !== reqRef.current) return;

      const binary = !!diff.binary;
      const original = binary ? "" : diff.original ?? "";
      const modified = binary ? "" : diff.modified ?? "";
      const models = binary ? null : makeModels(monaco, m, path, original, modified);
      const entry: FileEntry = {
        models,
        mode: m,
        path,
        diskBaseline: modified,
        cleanVersionId: models ? models.modified.getAlternativeVersionId() : 0,
        original,
        dirty: false,
        editable: isEditable(m, path, binary),
        binary,
      };
      cacheRef.current.set(key, entry);
      swapTo(key, entry, token);
    },
    [persistViewState, isEditable, swapTo, fetchDiff, withSuppressed],
  );

  // Reconcile the active file against disk on repo changes: clean buffers follow
  // the new content, dirty buffers raise a conflict instead of being clobbered,
  // and an unchanged file is a no-op so the viewport never thrashes.
  const reconcileActive = useCallback(async () => {
    if (savingRef.current) return; // our own save in flight; its echo is a no-op
    if (!activeRef.current) return; // hidden tab: catch up on becoming active
    const key = displayedRef.current;
    const editor = editorRef.current;
    if (!key || !editor) return;
    const entry = cacheRef.current.get(key);
    if (!entry || entry.binary || !entry.models) return;
    const { mode: m, path } = entry;

    const token = ++reqRef.current;
    let diff: FileDiffResult;
    try {
      diff = await fetchDiff(m, path);
    } catch {
      return;
    }
    if (token !== reqRef.current || displayedRef.current !== key) return;
    if (diff.binary) return;

    // A file can change status (e.g. modified -> deleted) under us; keep the
    // editable gate and the editor's readOnly in sync.
    const editable = isEditable(m, path, false);
    if (editable !== entry.editable) {
      entry.editable = editable;
      editor.updateOptions({ readOnly: !editable });
    }

    const disk = diff.modified ?? "";
    const original = diff.original ?? "";
    const models = entry.models;

    if (original !== entry.original) {
      entry.original = original;
      withSuppressed(() => models.original.setValue(original));
    }

    if (disk === entry.diskBaseline) return; // our own save echo / unrelated churn

    if (entry.dirty) {
      setConflict({ path, theirs: disk });
      return;
    }

    persistViewState();
    withSuppressed(() => models.modified.setValue(disk));
    markClean(entry, disk);
    restoreViewState(key, token);
  }, [fetchDiff, isEditable, markClean, persistViewState, restoreViewState, withSuppressed]);

  // Compare-and-swap write: only persists when disk still matches `expected`,
  // else raises the conflict for this file. Shared by save and overwrite.
  const casWrite = useCallback(
    async (entry: FileEntry, expected: string) => {
      if (!entry.models) return;
      const content = entry.models.modified.getValue();
      savingRef.current = true;
      let res: { written?: boolean; currentContent?: string };
      try {
        res = await WriteFileIfUnchanged(joinAbs(projectRoot, entry.path), expected, content);
      } catch (e) {
        savingRef.current = false;
        toast.error(e instanceof Error ? e.message : "Could not save file");
        return;
      }
      if (res?.written) {
        markClean(entry, content);
        setConflict((c) => (c?.path === entry.path ? null : c));
        toast.success("Saved");
      } else {
        setConflict({ path: entry.path, theirs: res?.currentContent ?? "" });
      }
      savingRef.current = false;
    },
    [projectRoot, markClean],
  );

  const saveActiveFile = useCallback(async () => {
    const key = displayedRef.current;
    if (!key) return;
    const entry = cacheRef.current.get(key);
    if (
      !entry ||
      entry.binary ||
      !entry.models ||
      !entry.dirty ||
      !isEditable(entry.mode, entry.path, entry.binary)
    ) {
      return;
    }
    await casWrite(entry, entry.diskBaseline);
  }, [casWrite, isEditable]);
  saveRef.current = saveActiveFile;

  const resolveConflict = useCallback(
    async (resolveMode: "overwrite" | "theirs" | "dismiss") => {
      const c = conflict;
      if (!c) return;
      const entry = cacheRef.current.get(keyOf("working", c.path));
      if (resolveMode === "dismiss" || !entry || !entry.models) {
        setConflict(null);
        return;
      }
      const models = entry.models;
      if (resolveMode === "theirs") {
        if (displayedRef.current === keyOf("working", c.path)) persistViewState();
        withSuppressed(() => models.modified.setValue(c.theirs));
        markClean(entry, c.theirs);
        setConflict(null);
        return;
      }
      if (!isEditable(entry.mode, entry.path, entry.binary)) {
        setConflict(null);
        return;
      }
      // overwrite: re-issue the CAS with their content as the new baseline so it
      // matches disk now; a third-party write since then re-raises the conflict.
      await casWrite(entry, c.theirs);
    },
    [conflict, persistViewState, withSuppressed, markClean, isEditable, casWrite],
  );

  useEffect(() => {
    let cancelled = false;
    GitDefaultBranch(projectRoot)
      .then((b) => {
        if (!cancelled && typeof b === "string") setBaseBranch(b);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [projectRoot]);

  // Keep selection valid as the changed-files list updates underneath us.
  useEffect(() => {
    if (files.length === 0) {
      setSelectedPath(null);
      return;
    }
    setSelectedPath((prev) =>
      prev && files.some((f) => f.path === prev) ? prev : files[0].path,
    );
  }, [files]);

  useEffect(() => {
    if (!hostRef.current) return;
    const monaco = setupMonaco();
    monacoRef.current = monaco;
    defineMonacoThemes(monaco);

    const editor = monaco.editor.createDiffEditor(hostRef.current, {
      theme: currentMonacoTheme(),
      automaticLayout: true,
      readOnly: true,
      originalEditable: false,
      renderSideBySide: true,
      ignoreTrimWhitespace: false,
      // Collapse unchanged regions into expandable "N hidden lines" bands,
      // like VS Code.
      hideUnchangedRegions: { enabled: true },
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      stickyScroll: { enabled: false },
      fontSize: fontSizeRef.current,
      fontFamily: MONACO_FONT_FAMILY,
      lineNumbers: "on",
      renderOverviewRuler: false,
      scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
      fixedOverflowWidgets: true,
    });
    editorRef.current = editor;

    const modified = editor.getModifiedEditor();
    const changeSub = modified.onDidChangeModelContent(() => {
      if (suppressChangeRef.current) return;
      const key = displayedRef.current;
      if (!key) return;
      const entry = cacheRef.current.get(key);
      if (!entry || !entry.models) return;
      const nowDirty =
        entry.models.modified.getAlternativeVersionId() !== entry.cleanVersionId;
      if (nowDirty !== entry.dirty) {
        entry.dirty = nowDirty;
        setDirty(entry.path, nowDirty);
      }
    });
    modified.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      saveRef.current();
    });
    setReady(true);

    const disposeTheme = observeMonacoTheme(monaco);

    const cache = cacheRef.current;
    return () => {
      disposeTheme();
      changeSub.dispose();
      editor.dispose();
      for (const entry of cache.values()) {
        entry.models?.original.dispose();
        entry.models?.modified.dispose();
      }
      cache.clear();
      editorRef.current = null;
      displayedRef.current = null;
    };
  }, [setDirty]);

  useEffect(() => {
    if (ready) selectFile(selectedPath);
  }, [selectedPath, mode, ready, selectFile]);

  useEffect(() => {
    editorRef.current?.updateOptions({ renderSideBySide: sideBySide });
  }, [sideBySide]);

  // Persist the zoom and push it to the single editor (the pool takes fontSize
  // as a prop and re-lays its editors itself).
  useEffect(() => {
    localStorage.setItem(FONT_SIZE_KEY, String(fontSize));
    editorRef.current?.updateOptions({ fontSize });
  }, [fontSize]);

  // Zoom via ⌘+ / ⌘- / ⌘0, and ⌘/pinch-wheel. Capture phase so the keys never
  // reach Monaco, and a non-passive wheel listener so we can preventDefault.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.metaKey) return;
      if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        e.stopPropagation();
        zoomBy(1);
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        e.stopPropagation();
        zoomBy(-1);
      } else if (e.key === "0") {
        e.preventDefault();
        e.stopPropagation();
        zoomReset();
      }
    };
    const onWheel = (e: WheelEvent) => {
      // ctrlKey covers the macOS trackpad pinch gesture.
      if (!e.metaKey && !e.ctrlKey) return;
      e.preventDefault();
      wheelAccumRef.current += e.deltaY;
      while (wheelAccumRef.current <= -ZOOM_WHEEL_STEP) {
        wheelAccumRef.current += ZOOM_WHEEL_STEP;
        zoomBy(1);
      }
      while (wheelAccumRef.current >= ZOOM_WHEEL_STEP) {
        wheelAccumRef.current -= ZOOM_WHEEL_STEP;
        zoomBy(-1);
      }
    };
    root.addEventListener("keydown", onKeyDown, true);
    root.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => {
      root.removeEventListener("keydown", onKeyDown, true);
      root.removeEventListener("wheel", onWheel, true);
    };
  }, [zoomBy, zoomReset]);

  useGitChanged(projectRoot, reconcileActive);

  // Catch up the active file's diff when the tab becomes visible again (its
  // git polling was paused while hidden).
  useEffect(() => {
    if (active) reconcileActive();
  }, [active, reconcileActive]);

  const sourceEditable = REVIEW_SOURCES[mode].editable;
  const activeStatus = selectedPath ? statusOf(selectedPath) : undefined;
  const activeEditable =
    sourceEditable &&
    !!selectedPath &&
    binaryPath !== selectedPath &&
    activeStatus !== "deleted";
  const activeDirty = !!selectedPath && dirtyPaths.has(selectedPath);

  return (
    <div ref={rootRef} className="flex h-full min-h-0 flex-col bg-[var(--bg-primary)]">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-[var(--border)] px-2.5">
        {onBack && (
          <Tooltip content="Back to terminal" side="bottom">
            <button
              onClick={onBack}
              aria-label="Back to terminal"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              <ChevronLeftIcon />
            </button>
          </Tooltip>
        )}
        <DiffSourceModeToggle mode={mode} onChange={setMode} />
        <span className="min-w-0 flex-1 truncate text-xs text-[var(--text-muted)]">
          {viewMode === "all" ? "All files" : selectedPath ?? "Review"}
        </span>
        {viewMode === "single" && (
          <SegmentedControl
            value={sideBySide ? "split" : "unified"}
            options={VIEW_OPTIONS}
            onChange={(v) => setSideBySide(v === "split")}
          />
        )}
        <SegmentedControl
          value={viewMode}
          options={PANE_VIEW_OPTIONS}
          onChange={(v) => setViewMode(v as PaneViewMode)}
        />
        {viewMode === "single" && activeEditable && activeDirty && (
          <button
            onClick={() => saveActiveFile()}
            className="shrink-0 rounded-md bg-[var(--text-primary)] px-3 py-1 text-[11px] font-medium text-[var(--bg-primary)] transition-opacity hover:opacity-90"
          >
            Save
          </button>
        )}
        <DiffZoomControl
          fontSize={fontSize}
          baseFontSize={baseFontSize}
          min={FONT_SIZE_MIN}
          max={FONT_SIZE_MAX}
          onZoom={zoomBy}
          onReset={zoomReset}
        />
        <Tooltip content="Refresh changes" side="bottom">
          <button
            onClick={() => refresh()}
            aria-label="Refresh changes"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <RefreshIcon />
          </button>
        </Tooltip>
      </div>

      {conflict && mode === "working" && conflict.path === selectedPath && (
        <DiffConflictBanner
          path={conflict.path}
          onOverwrite={() => resolveConflict("overwrite")}
          onUseTheirs={() => resolveConflict("theirs")}
          onDismiss={() => resolveConflict("dismiss")}
        />
      )}

      <div className="flex min-h-0 flex-1">
        <div
          className="relative flex shrink-0 flex-col border-r border-[var(--border)]"
          style={{ width: treeWidth }}
        >
          <div className="flex h-9 shrink-0 items-center justify-between px-3">
            <span className="text-[11px] font-medium text-[var(--text-secondary)]">
              Changes
            </span>
            <span className="text-[11px] tabular-nums text-[var(--text-muted)]">
              {files.length}
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {files.length === 0 ? (
              <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--bg-secondary)] text-[var(--text-muted)]">
                  <FileIcon size={18} />
                </div>
                <div className="space-y-0.5">
                  <p className="text-xs font-medium text-[var(--text-secondary)]">
                    No changes
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Edits show up here as you work.
                  </p>
                </div>
              </div>
            ) : (
              <DiffFileTree
                files={files}
                selectedPath={selectedPath}
                dirtyPaths={
                  mode === "working" && viewMode === "single" ? dirtyPaths : EMPTY_DIRTY
                }
                onSelect={(path) => {
                  setSelectedPath(path);
                  // In the all-files overview, scroll the stack to the file.
                  if (viewMode === "all") stackRef.current?.scrollToFile(path);
                }}
              />
            )}
          </div>
          <div
            onMouseDown={handleResizeStart}
            aria-hidden
            className="absolute inset-y-0 -right-1.5 z-10 w-3 cursor-col-resize before:absolute before:inset-y-0 before:left-1/2 before:w-px before:-translate-x-1/2 hover:before:bg-[var(--accent-cyan)]/30 active:before:bg-[var(--accent-cyan)]/50"
          />
        </div>
        {/* The Monaco host stays mounted (hidden in all-files mode) so the editor
            persists across view toggles. */}
        <div className={viewMode === "all" ? "hidden" : "relative min-w-0 flex-1"}>
          <div
            ref={hostRef}
            className="h-full w-full"
            style={{ visibility: binaryPath || !selectedPath ? "hidden" : "visible" }}
          />
          {selectedPath && binaryPath === selectedPath && (
            <div className="absolute inset-0">
              <BinaryFilePlaceholder path={selectedPath} />
            </div>
          )}
          {!selectedPath && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--bg-secondary)] text-[var(--text-muted)]">
                <FileIcon size={18} />
              </div>
              <div className="space-y-0.5">
                <p className="text-xs font-medium text-[var(--text-secondary)]">
                  {files.length === 0 ? "Nothing to review" : "Select a file"}
                </p>
                <p className="text-[11px] text-[var(--text-muted)]">
                  {files.length === 0
                    ? "Your working tree is clean."
                    : "Pick a file to see its diff."}
                </p>
              </div>
            </div>
          )}
        </div>
        {/* The stack stays mounted (hidden in single mode) so in-progress edits
            in its per-file editors survive a view toggle. */}
        <div className={viewMode === "single" ? "hidden" : "min-w-0 flex-1"}>
          <MonacoDiffPool
            ref={stackRef}
            projectRoot={projectRoot}
            files={files}
            mode={mode}
            baseBranch={baseBranch}
            fontSize={fontSize}
            active={active && viewMode === "all"}
          />
        </div>
      </div>
    </div>
  );
}
