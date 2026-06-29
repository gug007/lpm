import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type * as monacoNs from "monaco-editor";
import { toast } from "sonner";
import { WriteFileIfUnchanged } from "../../../bridge/commands";
import { main } from "../../../bridge/models";
import { joinAbs } from "../../path";
import { setupMonaco } from "../../monaco-setup";
import {
  MONACO_FONT_FAMILY,
  currentMonacoTheme,
  defineMonacoThemes,
  observeMonacoTheme,
} from "../../monaco-theme";
import { useGitChanged } from "../../hooks/useGitChanged";
import { STATUS_DISPLAY, DEFAULT_STATUS } from "../ChangedFilesTree";
import { LayersIcon } from "../icons";
import { READ_HEAVY_DIFF_OPTIONS } from "./diffEditorOptions";
import { REVIEW_SOURCES, type ReviewMode } from "./reviewSource";
import { DiffConflictBanner } from "./DiffConflictBanner";
import { BinaryFilePlaceholder } from "./BinaryFilePlaceholder";

type Monaco = typeof monacoNs;
type ChangedFile = main.ChangedFile;
type DiffModels = {
  original: monacoNs.editor.ITextModel;
  modified: monacoNs.editor.ITextModel;
};

// One persistent entry per changed file. Models outlive the editor that renders
// them — recycling an editor away from a file leaves its buffer (and any unsaved
// edits) intact in the model, so scrolling back restores the edit exactly.
type Entry = {
  models: DiffModels | null;
  fetched: boolean;
  binary: boolean;
  editable: boolean;
  diskBaseline: string;
  original: string;
  cleanVersionId: number;
  viewState: monacoNs.editor.IDiffEditorViewState | null;
};

// A reusable editor instance. We keep a small fixed pool of these and move each
// host into the body of whichever file it is assigned to, swapping models instead
// of creating/disposing editors as the user scrolls.
type Slot = {
  host: HTMLDivElement;
  editor: monacoNs.editor.IStandaloneDiffEditor;
  path: string | null;
  token: number;
  subs: monacoNs.IDisposable[];
};

const POOL_SIZE = 8;
const LAZY_ROOT_MARGIN_PX = 400;
const DEFAULT_SLOT_HEIGHT = 220;

export interface MonacoDiffPoolHandle {
  scrollToFile: (path: string) => void;
}

interface MonacoDiffPoolProps {
  projectRoot: string;
  files: ChangedFile[];
  mode: ReviewMode;
  baseBranch: string;
  fontSize: number;
  active: boolean;
}

export const MonacoDiffPool = forwardRef<MonacoDiffPoolHandle, MonacoDiffPoolProps>(
  function MonacoDiffPool(
    { projectRoot, files, mode, baseBranch, fontSize, active },
    ref,
  ) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const holdingRef = useRef<HTMLDivElement>(null);
    const frameBodyRef = useRef<Map<string, HTMLDivElement>>(new Map());
    const frameRef = useRef<Map<string, HTMLDivElement>>(new Map());
    const observerRef = useRef<IntersectionObserver | null>(null);
    const monacoRef = useRef<Monaco | null>(null);
    const slotsRef = useRef<Slot[]>([]);
    const entriesRef = useRef<Map<string, Entry>>(new Map());
    const visibleRef = useRef<Set<string>>(new Set());
    const binaryKnownRef = useRef<Set<string>>(new Set());
    const suppressRef = useRef(false);
    const savingRef = useRef<Set<string>>(new Set());
    const activeRef = useRef(active);
    const filesRef = useRef<ChangedFile[]>(files);
    const statusRef = useRef<Map<string, string>>(new Map());
    const saveRef = useRef<(path: string) => void>(() => {});
    activeRef.current = active;
    filesRef.current = files;
    statusRef.current = new Map(files.map((f) => [f.path, f.status]));

    const [ready, setReady] = useState(false);
    const [heights, setHeights] = useState<Map<string, number>>(new Map());
    const [attached, setAttached] = useState<Set<string>>(new Set());
    const [dirtyPaths, setDirtyPaths] = useState<Set<string>>(new Set());
    const [binaryPaths, setBinaryPaths] = useState<Set<string>>(new Set());
    const [conflicts, setConflicts] = useState<Map<string, string>>(new Map());

    const slotHeight = (path: string) => heights.get(path) ?? DEFAULT_SLOT_HEIGHT;

    const setDirty = useCallback((path: string, dirty: boolean) => {
      setDirtyPaths((prev) => {
        if (dirty === prev.has(path)) return prev;
        const next = new Set(prev);
        if (dirty) next.add(path);
        else next.delete(path);
        return next;
      });
    }, []);

    const markAttached = useCallback((path: string, on: boolean) => {
      setAttached((prev) => {
        if (on === prev.has(path)) return prev;
        const next = new Set(prev);
        if (on) next.add(path);
        else next.delete(path);
        return next;
      });
    }, []);

    const isEditable = useCallback(
      (path: string, binary: boolean) =>
        REVIEW_SOURCES[mode].editable &&
        !binary &&
        statusRef.current.get(path) !== "deleted",
      [mode],
    );

    const makeModels = useCallback(
      (monaco: Monaco, path: string, original: string, modified: string): DiffModels => {
        const make = (side: string, value: string) => {
          const uri = monaco.Uri.from({
            scheme: "lpm-diff",
            authority: "pool",
            path: `/${path}`,
            query: `mode=${mode}&side=${side}`,
          });
          monaco.editor.getModel(uri)?.dispose();
          return monaco.editor.createModel(value, undefined, uri);
        };
        return { original: make("original", original), modified: make("modified", modified) };
      },
      [mode],
    );

    // Lazily fetch a file's diff and build its persistent models once. Returns the
    // cached entry on every later call so edits are never thrown away.
    const ensureEntry = useCallback(
      async (path: string): Promise<Entry | null> => {
        const existing = entriesRef.current.get(path);
        if (existing?.fetched) return existing;
        const monaco = monacoRef.current;
        if (!monaco) return null;
        let diff: { original?: string; modified?: string; binary?: boolean };
        try {
          diff = await REVIEW_SOURCES[mode].fetchDiff(projectRoot, path, baseBranch);
        } catch {
          return null;
        }
        const binary = !!diff.binary;
        const original = binary ? "" : diff.original ?? "";
        const modified = binary ? "" : diff.modified ?? "";
        const models = binary ? null : makeModels(monaco, path, original, modified);
        const entry: Entry = {
          models,
          fetched: true,
          binary,
          editable: isEditable(path, binary),
          diskBaseline: modified,
          original,
          cleanVersionId: models ? models.modified.getAlternativeVersionId() : 0,
          viewState: null,
        };
        entriesRef.current.set(path, entry);
        if (binary) {
          binaryKnownRef.current.add(path);
          setBinaryPaths((prev) => (prev.has(path) ? prev : new Set(prev).add(path)));
        }
        return entry;
      },
      [projectRoot, mode, baseBranch, makeModels, isEditable],
    );

    // Size a slot's editor to its content and cache the height for the placeholder
    // shown when the editor later recycles away from this file.
    const layoutSlot = useCallback((slot: Slot) => {
      if (!slot.path) return;
      const body = frameBodyRef.current.get(slot.path);
      if (!body) return;
      const orig = slot.editor.getOriginalEditor();
      const mod = slot.editor.getModifiedEditor();
      const h = Math.max(40, orig.getContentHeight(), mod.getContentHeight());
      slot.host.style.height = `${h}px`;
      slot.editor.layout({ width: body.clientWidth, height: h });
      const path = slot.path;
      setHeights((prev) => (prev.get(path) === h ? prev : new Map(prev).set(path, h)));
    }, []);

    // Move a slot's host back to the hidden holding area and detach its model,
    // preserving the file's view state and unsaved edits (held in the model).
    const parkSlot = useCallback((slot: Slot) => {
      if (slot.path) {
        const entry = entriesRef.current.get(slot.path);
        if (entry) entry.viewState = slot.editor.saveViewState();
        markAttached(slot.path, false);
      }
      slot.subs.forEach((s) => s.dispose());
      slot.subs = [];
      slot.editor.setModel(null);
      holdingRef.current?.appendChild(slot.host);
      slot.path = null;
      slot.token++;
    }, [markAttached]);

    // Bind a pool editor to a file: swap in its models, move the host into the
    // file's body, wire dirty/height/save, and restore its view state.
    const attachSlot = useCallback(
      async (slot: Slot, path: string) => {
        if (slot.path === path) return;
        const token = ++slot.token;
        if (slot.path) parkSlot(slot);
        slot.token = token;
        slot.path = path;
        const entry = await ensureEntry(path);
        if (slot.token !== token) return; // reassigned mid-fetch
        if (!entry || entry.binary || !entry.models) {
          slot.path = null;
          return;
        }
        const body = frameBodyRef.current.get(path);
        if (!body) {
          slot.path = null;
          return;
        }
        const editor = slot.editor;
        slot.host.style.width = "100%";
        body.appendChild(slot.host);
        editor.setModel({ original: entry.models.original, modified: entry.models.modified });
        editor.updateOptions({ readOnly: !entry.editable });
        if (entry.viewState) editor.restoreViewState(entry.viewState);

        const orig = editor.getOriginalEditor();
        const mod = editor.getModifiedEditor();
        slot.subs.push(orig.onDidContentSizeChange(() => layoutSlot(slot)));
        slot.subs.push(mod.onDidContentSizeChange(() => layoutSlot(slot)));
        slot.subs.push(
          mod.onDidChangeModelContent(() => {
            if (suppressRef.current) return;
            const e = entriesRef.current.get(path);
            if (!e?.models) return;
            setDirty(path, e.models.modified.getAlternativeVersionId() !== e.cleanVersionId);
          }),
        );
        markAttached(path, true);
        layoutSlot(slot);
      },
      [parkSlot, ensureEntry, layoutSlot, markAttached, setDirty],
    );

    // Assign pool editors to the visible files (document order, capped at the pool
    // size), recycling editors off files that scrolled away.
    const syncAssignments = useCallback(() => {
      const slots = slotsRef.current;
      if (slots.length === 0) return;
      const targets = filesRef.current
        .map((f) => f.path)
        .filter((p) => visibleRef.current.has(p) && !binaryKnownRef.current.has(p))
        .slice(0, POOL_SIZE);
      const targetSet = new Set(targets);
      const held = new Set(
        slots.map((s) => s.path).filter((p): p is string => !!p && targetSet.has(p)),
      );
      const free = slots.filter((s) => !s.path || !targetSet.has(s.path));
      let fi = 0;
      for (const path of targets) {
        if (held.has(path)) continue;
        const slot = free[fi++];
        if (!slot) break;
        attachSlot(slot, path);
      }
      for (const slot of free.slice(fi)) {
        if (slot.path) parkSlot(slot);
      }
    }, [attachSlot, parkSlot]);

    // --- save / conflict / reconcile (per file, mirrors the single-file pane) ---

    const casWrite = useCallback(
      async (path: string, expected: string) => {
        const entry = entriesRef.current.get(path);
        if (!entry?.models) return;
        const content = entry.models.modified.getValue();
        savingRef.current.add(path);
        let res: { written?: boolean; currentContent?: string };
        try {
          res = await WriteFileIfUnchanged(joinAbs(projectRoot, path), expected, content);
        } catch (e) {
          savingRef.current.delete(path);
          toast.error(e instanceof Error ? e.message : "Could not save file");
          return;
        }
        if (res?.written) {
          entry.diskBaseline = content;
          entry.cleanVersionId = entry.models.modified.getAlternativeVersionId();
          setDirty(path, false);
          setConflicts((prev) => {
            if (!prev.has(path)) return prev;
            const next = new Map(prev);
            next.delete(path);
            return next;
          });
          toast.success("Saved");
        } else {
          setConflicts((prev) => new Map(prev).set(path, res?.currentContent ?? ""));
        }
        savingRef.current.delete(path);
      },
      [projectRoot, setDirty],
    );

    const saveFile = useCallback(
      (path: string) => {
        const entry = entriesRef.current.get(path);
        if (
          !entry?.models ||
          entry.binary ||
          !dirtyPaths.has(path) ||
          !isEditable(path, entry.binary) ||
          savingRef.current.has(path)
        ) {
          return;
        }
        casWrite(path, entry.diskBaseline);
      },
      [casWrite, dirtyPaths, isEditable],
    );
    saveRef.current = saveFile;

    const resolveConflict = useCallback(
      (path: string, kind: "overwrite" | "theirs" | "dismiss") => {
        const theirs = conflicts.get(path);
        const entry = entriesRef.current.get(path);
        const dismiss = () =>
          setConflicts((prev) => {
            if (!prev.has(path)) return prev;
            const next = new Map(prev);
            next.delete(path);
            return next;
          });
        if (theirs === undefined || !entry?.models || kind === "dismiss") {
          dismiss();
          return;
        }
        if (kind === "theirs") {
          suppressRef.current = true;
          entry.models.modified.setValue(theirs);
          suppressRef.current = false;
          entry.diskBaseline = theirs;
          entry.cleanVersionId = entry.models.modified.getAlternativeVersionId();
          setDirty(path, false);
          dismiss();
          return;
        }
        casWrite(path, theirs);
      },
      [conflicts, casWrite, setDirty],
    );

    // Follow disk for clean buffers and raise a conflict for dirty ones, but only
    // for the files currently backed by an editor (the visible window).
    const reconcile = useCallback(async () => {
      if (!activeRef.current) return;
      const paths = slotsRef.current
        .map((s) => s.path)
        .filter((p): p is string => !!p);
      for (const path of paths) {
        if (savingRef.current.has(path)) continue;
        const entry = entriesRef.current.get(path);
        if (!entry?.models || entry.binary) continue;
        let diff: { original?: string; modified?: string; binary?: boolean };
        try {
          diff = await REVIEW_SOURCES[mode].fetchDiff(projectRoot, path, baseBranch);
        } catch {
          continue;
        }
        if (diff.binary) continue;
        const disk = diff.modified ?? "";
        const original = diff.original ?? "";
        const editable = isEditable(path, false);
        if (editable !== entry.editable) {
          entry.editable = editable;
          slotsRef.current.find((s) => s.path === path)?.editor.updateOptions({
            readOnly: !editable,
          });
        }
        if (original !== entry.original) {
          entry.original = original;
          suppressRef.current = true;
          entry.models.original.setValue(original);
          suppressRef.current = false;
        }
        if (disk === entry.diskBaseline) continue;
        const dirty =
          entry.models.modified.getAlternativeVersionId() !== entry.cleanVersionId;
        if (dirty) {
          setConflicts((prev) => new Map(prev).set(path, disk));
          continue;
        }
        suppressRef.current = true;
        entry.models.modified.setValue(disk);
        suppressRef.current = false;
        entry.diskBaseline = disk;
        entry.cleanVersionId = entry.models.modified.getAlternativeVersionId();
      }
    }, [projectRoot, mode, baseBranch, isEditable]);

    useGitChanged(projectRoot, reconcile);
    useEffect(() => {
      if (active) reconcile();
    }, [active, reconcile]);

    // --- editor pool lifecycle ---

    useEffect(() => {
      const holding = holdingRef.current;
      if (!holding) return;
      let cancelled = false;
      const monaco = setupMonaco();
      defineMonacoThemes(monaco);
      monacoRef.current = monaco;
      const disposeTheme = observeMonacoTheme(monaco);
      const slots: Slot[] = [];
      for (let i = 0; i < POOL_SIZE; i++) {
        const host = document.createElement("div");
        host.style.width = "100%";
        holding.appendChild(host);
        const editor = monaco.editor.createDiffEditor(host, {
          ...READ_HEAVY_DIFF_OPTIONS,
          theme: currentMonacoTheme(),
          automaticLayout: false,
          readOnly: true,
          originalEditable: false,
          renderSideBySide: true,
          ignoreTrimWhitespace: false,
          hideUnchangedRegions: { enabled: true },
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          scrollbar: {
            vertical: "hidden",
            alwaysConsumeMouseWheel: false,
            horizontalScrollbarSize: 10,
          },
          renderOverviewRuler: false,
          overviewRulerLanes: 0,
          fontSize,
          fontFamily: MONACO_FONT_FAMILY,
          lineNumbers: "on",
          fixedOverflowWidgets: true,
        });
        const slot: Slot = { host, editor, path: null, token: 0, subs: [] };
        editor
          .getModifiedEditor()
          .addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
            if (slot.path) saveRef.current(slot.path);
          });
        slots.push(slot);
      }
      slotsRef.current = slots;
      if (!cancelled) setReady(true);
      return () => {
        cancelled = true;
        disposeTheme();
        slots.forEach((s) => {
          s.subs.forEach((d) => d.dispose());
          s.editor.dispose();
          s.host.remove();
        });
        slotsRef.current = [];
        entriesRef.current.forEach((e) => {
          e.models?.original.dispose();
          e.models?.modified.dispose();
        });
        entriesRef.current.clear();
      };
      // Pool is created once; fontSize changes are pushed via updateOptions below.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
      slotsRef.current.forEach((s) => s.editor.updateOptions({ fontSize }));
    }, [fontSize]);

    // Observe each file frame; drive assignment off what is near the viewport.
    useEffect(() => {
      if (!ready) return;
      const root = scrollRef.current;
      if (!root) return;
      const observer = new IntersectionObserver(
        (entries) => {
          let changed = false;
          for (const entry of entries) {
            const path = (entry.target as HTMLElement).dataset.path;
            if (!path) continue;
            if (entry.isIntersecting) {
              if (!visibleRef.current.has(path)) {
                visibleRef.current.add(path);
                changed = true;
              }
            } else if (visibleRef.current.delete(path)) {
              changed = true;
            }
          }
          if (changed) syncAssignments();
        },
        { root, rootMargin: `${LAZY_ROOT_MARGIN_PX}px 0px` },
      );
      observerRef.current = observer;
      frameRef.current.forEach((el) => observer.observe(el));
      return () => {
        observer.disconnect();
        observerRef.current = null;
      };
    }, [ready, syncAssignments]);

    // Drop bookkeeping for files that left the changeset; keep everything else so
    // unsaved edits survive an unrelated list change.
    useEffect(() => {
      const valid = new Set(files.map((f) => f.path));
      for (const path of [...entriesRef.current.keys()]) {
        if (valid.has(path)) continue;
        const slot = slotsRef.current.find((s) => s.path === path);
        if (slot) parkSlot(slot);
        const entry = entriesRef.current.get(path);
        entry?.models?.original.dispose();
        entry?.models?.modified.dispose();
        entriesRef.current.delete(path);
        binaryKnownRef.current.delete(path);
        visibleRef.current.delete(path);
      }
      if (ready) syncAssignments();
    }, [files, ready, parkSlot, syncAssignments]);

    // Relayout attached editors when the container width changes (split drag etc.).
    useEffect(() => {
      const root = scrollRef.current;
      if (!root || typeof ResizeObserver === "undefined") return;
      const ro = new ResizeObserver(() => {
        slotsRef.current.forEach((s) => {
          if (s.path) layoutSlot(s);
        });
      });
      ro.observe(root);
      return () => ro.disconnect();
    }, [layoutSlot]);

    useImperativeHandle(
      ref,
      () => ({
        scrollToFile: (path: string) => {
          if (!visibleRef.current.has(path)) {
            visibleRef.current.add(path);
            syncAssignments();
          }
          requestAnimationFrame(() => {
            frameRef.current.get(path)?.scrollIntoView({ behavior: "smooth", block: "start" });
          });
        },
      }),
      [syncAssignments],
    );

    return (
      <div ref={scrollRef} className="h-full w-full overflow-y-auto">
        <div ref={holdingRef} aria-hidden className="hidden" />
        {files.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--bg-secondary)] text-[var(--text-muted)]">
              <LayersIcon />
            </div>
            <p className="text-xs font-medium text-[var(--text-secondary)]">
              Nothing to review
            </p>
          </div>
        ) : (
          files.map((file) => {
            const path = file.path;
            const { dot } = STATUS_DISPLAY[file.status] ?? DEFAULT_STATUS;
            const isBinary = binaryPaths.has(path);
            const dirty = dirtyPaths.has(path);
            const editable = isEditable(path, isBinary);
            const theirs = conflicts.get(path);
            const isAttached = attached.has(path);
            return (
              <div
                key={`${mode}-${path}`}
                data-path={path}
                ref={(el) => {
                  if (el) {
                    const prev = frameRef.current.get(path);
                    if (prev && prev !== el) observerRef.current?.unobserve(prev);
                    frameRef.current.set(path, el);
                    observerRef.current?.observe(el);
                  } else {
                    const prev = frameRef.current.get(path);
                    if (prev) observerRef.current?.unobserve(prev);
                    frameRef.current.delete(path);
                  }
                }}
                className="border-b border-[var(--border)] last:border-b-0"
              >
                <div className="sticky top-0 z-10 flex items-center gap-2.5 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-2">
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`}
                    title={file.status}
                    aria-label={file.status}
                  />
                  <span className="truncate text-[11px] font-medium text-[var(--text-secondary)]">
                    {path}
                  </span>
                  {dirty && (
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent-cyan)]"
                      title="Unsaved changes"
                    />
                  )}
                  <span className="flex-1" />
                  {editable && dirty && (
                    <button
                      onClick={() => saveFile(path)}
                      className="shrink-0 rounded-md bg-[var(--text-primary)] px-2.5 py-1 text-[10px] font-medium text-[var(--bg-primary)] transition-opacity hover:opacity-90"
                    >
                      Save
                    </button>
                  )}
                </div>
                {theirs !== undefined && (
                  <DiffConflictBanner
                    path={path}
                    onOverwrite={() => resolveConflict(path, "overwrite")}
                    onUseTheirs={() => resolveConflict(path, "theirs")}
                    onDismiss={() => resolveConflict(path, "dismiss")}
                  />
                )}
                {isBinary ? (
                  <div className="py-6">
                    <BinaryFilePlaceholder path={path} />
                  </div>
                ) : (
                  <div
                    ref={(el) => {
                      if (el) frameBodyRef.current.set(path, el);
                      else frameBodyRef.current.delete(path);
                    }}
                    className="w-full"
                    style={{ minHeight: isAttached ? undefined : slotHeight(path) }}
                  />
                )}
              </div>
            );
          })
        )}
      </div>
    );
  },
);
