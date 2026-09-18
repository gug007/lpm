import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
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
import { LayersIcon } from "../icons";
import { READ_HEAVY_DIFF_OPTIONS } from "./diffEditorOptions";
import {
  REVIEW_SOURCES,
  isPathEditable,
  makeDiffModels,
  type DiffModels,
  type FileDiffResult,
  type ReviewMode,
} from "./reviewSource";
import { DiffPoolRow, type ConflictResolution } from "./DiffPoolRow";
import { createDiffRowsStore, DEFAULT_SLOT_HEIGHT, type DiffRowState } from "./diffPoolRows";
import { StackLayout } from "./stackLayout";

type Monaco = typeof monacoNs;
type ChangedFile = main.ChangedFile;

// One persistent entry per changed file. Models outlive the editor that renders
// them — recycling an editor away from a file leaves its buffer (and any unsaved
// edits) intact in the model, so scrolling back restores the edit exactly.
type Entry = {
  models: DiffModels | null;
  fetched: boolean;
  binary: boolean;
  tooLarge: boolean;
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
  // False until the editor has computed its diff and collapsed unchanged regions
  // off-screen; the frame shows its placeholder until then, so the user never
  // sees the tall→collapse staging — only the finished diff appears in place.
  revealed: boolean;
  // Set when the pool is torn down. In-flight async (a mid-fetch attach, a
  // StrictMode remount) checks this before touching the editor, which Monaco
  // would otherwise throw "InstantiationService has been disposed" on.
  disposed: boolean;
};

const POOL_SIZE = 10;
// Rows this close to the viewport get an editor...
const ASSIGN_MARGIN_PX = 500;
// ...and rows this close are mounted at all. Wider than the assignment margin,
// so a row with an editor is always in the DOM.
const MOUNT_MARGIN_PX = 900;
// A row's header and border, for rows that have never been measured.
const ROW_CHROME_PX = 34;
// A scroll that carries more than a viewport in this window is a fling: frames
// passing by are left as placeholders, since each editor assigned mid-fling
// would queue a diff in the worker that lands long after the frame has gone,
// delaying the diffs of wherever the fling stops.
const FLING_WINDOW_MS = 150;
// No scroll event for this long means the scrolling has stopped.
const FLING_SETTLE_MS = 150;
const FLING_RECHECK_MS = 100;
// Reveal once the editor stops resizing for this long (hideUnchangedRegions
// collapses in several passes, so we wait for quiet, not the first event)...
const REVEAL_QUIET_MS = 70;
// ...but never wait longer than this once the diff is in, so a never-quiet file
// still reveals.
const REVEAL_MAX_MS = 500;
// A diff that never arrives (a worker failure) reveals the editor as is, so a
// frame can't stay a placeholder forever.
const REVEAL_FALLBACK_MS = 5000;

export interface MonacoDiffPoolHandle {
  scrollToFile: (path: string) => void;
}

interface MonacoDiffPoolProps {
  projectRoot: string;
  files: ChangedFile[];
  mode: ReviewMode;
  baseBranch: string;
  fontSize: number;
  // When false, non-added files render as a single-column inline diff. Added
  // files ignore this and always use the true-inline rendering (see attachSlot).
  sideBySide?: boolean;
  active: boolean;
  // Reports the file occupying the top of the viewport as the user scrolls, so
  // the changes tree can highlight whatever they're reading.
  onActiveFileChange?: (path: string) => void;
  // When given, files not in the set dim and show "(excluded)" (commit flow).
  selected?: Set<string>;
  // Namespaces the Monaco model URIs so two pools mounted at once (e.g. the
  // review tab and the commit modal) never share — and dispose — each other's
  // models. Must be distinct per mount site.
  authority?: string;
  // Reports which paths have unsaved edits, so a host's file tree can badge them
  // and warn before discarding them (e.g. the commit modal on close).
  onDirtyPathsChange?: (paths: Set<string>) => void;
}

export const MonacoDiffPool = forwardRef<MonacoDiffPoolHandle, MonacoDiffPoolProps>(
  function MonacoDiffPool(
    {
      projectRoot,
      files,
      mode,
      baseBranch,
      fontSize,
      sideBySide = true,
      active,
      onActiveFileChange,
      selected,
      authority = "pool",
      onDirtyPathsChange,
    },
    ref,
  ) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const holdingRef = useRef<HTMLDivElement>(null);
    const frameBodyRef = useRef<Map<string, HTMLDivElement>>(new Map());
    const frameRef = useRef<Map<string, HTMLDivElement>>(new Map());
    const frameObserverRef = useRef<ResizeObserver | null>(null);
    // Where every row sits, from measured heights. Only rows near the viewport
    // are mounted, so nothing else can say; and it answers without reading the
    // DOM, so no scroll frame forces a layout.
    const layoutRef = useRef(new StackLayout(DEFAULT_SLOT_HEIGHT + ROW_CHROME_PX));
    const layoutFilesRef = useRef<ChangedFile[] | null>(null);
    const layoutDirtyRef = useRef(true);
    const scrollTopRef = useRef(0);
    const frameRafRef = useRef<number | null>(null);
    const sampleVelocityRef = useRef(false);
    const compensatingRef = useRef(false);
    const monacoRef = useRef<Monaco | null>(null);
    // True only while the pool mount effect is live. Guards lazy slot creation so
    // a torn-down (StrictMode remount) instance can never build editors.
    const poolLiveRef = useRef(false);
    const slotsRef = useRef<Slot[]>([]);
    const entriesRef = useRef<Map<string, Entry>>(new Map());
    // Shared in-flight fetch per path so a batch fetch and a stray single-file
    // fetch for the same file never both build an entry.
    const inflightRef = useRef<Map<string, Promise<Entry | null>>>(new Map());
    const suppressRef = useRef(false);
    const savingRef = useRef<Set<string>>(new Set());
    const pendingLayoutRef = useRef<Set<Slot>>(new Set());
    const layoutRafRef = useRef<number | null>(null);
    const suppressAnchorRef = useRef(false);
    const scrollSuppressTimerRef = useRef<number | null>(null);
    const lastActiveRef = useRef<string | null>(null);
    // The scroller's inner size, kept by its ResizeObserver. Every frame body
    // spans its width, so editors lay out from this number instead of reading
    // clientWidth right after a DOM write, which would force a layout each time.
    const viewportRef = useRef({ width: 0, height: 0 });
    // Scroll velocity, sampled per frame while scrolling, and the time of the
    // last scroll event, which says whether the scrolling has stopped.
    const scrollSampleRef = useRef({ t: 0, y: 0, v: 0 });
    const lastScrollEventRef = useRef(0);
    const deferredSyncRef = useRef<number | null>(null);
    const syncRef = useRef<() => void>(() => {});
    const activeRef = useRef(active);
    // Latest fontSize, read at lazy slot creation so a slot born after a font-size
    // change starts at the current size (the eager path baked it into construction).
    const fontSizeRef = useRef(fontSize);
    // Read inside attachSlot so the callback identity doesn't churn on toggle;
    // the effect below pushes the change to already-attached slots.
    const sideBySideRef = useRef(sideBySide);
    const filesRef = useRef<ChangedFile[]>(files);
    const statusRef = useRef<Map<string, string>>(new Map());
    const saveRef = useRef<(path: string) => void>(() => {});
    const resolveRef = useRef<(path: string, kind: ConflictResolution) => void>(
      () => {},
    );
    activeRef.current = active;
    fontSizeRef.current = fontSize;
    sideBySideRef.current = sideBySide;
    filesRef.current = files;
    const statusMap = useMemo(
      () => new Map(files.map((f) => [f.path, f.status])),
      [files],
    );
    statusRef.current = statusMap;
    if (layoutFilesRef.current !== files) {
      layoutFilesRef.current = files;
      layoutRef.current.setRows(files.map((f) => f.path));
      layoutDirtyRef.current = true;
    }

    const [ready, setReady] = useState(false);
    // The mounted rows, as an inclusive index range.
    const [view, setView] = useState({ first: 0, last: -1 });
    const viewRef = useRef(view);
    // Per-file row state lives in a store the rows subscribe to, so a settle
    // re-renders one row rather than the whole stack.
    const [rowStore] = useState(createDiffRowsStore);
    const patchRow = useCallback(
      (path: string, patch: Partial<DiffRowState>) => rowStore.getState().patch(path, patch),
      [rowStore],
    );
    const setDirty = useCallback(
      (path: string, dirty: boolean) => patchRow(path, { dirty }),
      [patchRow],
    );
    const markRevealed = useCallback(
      (path: string, on: boolean) => patchRow(path, { revealed: on }),
      [patchRow],
    );

    const isEditable = useCallback(
      (path: string, binary: boolean) =>
        isPathEditable(mode, statusRef.current.get(path), binary),
      [mode],
    );

    // Build a file's persistent entry (models + bookkeeping) from a fetched diff,
    // once. Returns the cached entry if it was already built (shared batch/single
    // fetches can both land here) so edits are never thrown away.
    const buildEntry = useCallback(
      (path: string, diff: FileDiffResult): Entry | null => {
        const existing = entriesRef.current.get(path);
        if (existing?.fetched) return existing;
        const monaco = monacoRef.current;
        if (!monaco) return null;
        const binary = !!diff.binary;
        const tooLarge = !!diff.tooLarge;
        const noEditor = binary || tooLarge;
        const original = noEditor ? "" : diff.original ?? "";
        const modified = noEditor ? "" : diff.modified ?? "";
        const models = noEditor
          ? null
          : makeDiffModels(monaco, authority, mode, path, original, modified);
        const entry: Entry = {
          models,
          fetched: true,
          binary,
          tooLarge,
          editable: isEditable(path, noEditor),
          diskBaseline: modified,
          original,
          cleanVersionId: models ? models.modified.getAlternativeVersionId() : 0,
          viewState: null,
        };
        entriesRef.current.set(path, entry);
        if (noEditor) patchRow(path, { binary, tooLarge });
        return entry;
      },
      [mode, authority, isEditable, patchRow],
    );

    // Fetch every not-yet-fetched path in ONE batch call, registering a shared
    // per-path promise so a concurrent ensureEntry resolves from the same fetch.
    const fetchBatch = useCallback(
      (paths: string[]) => {
        const missing = paths.filter(
          (p) => !entriesRef.current.get(p)?.fetched && !inflightRef.current.has(p),
        );
        if (missing.length === 0) return;
        const batch = REVIEW_SOURCES[mode]
          .fetchDiffs(
            projectRoot,
            missing.map((p) => ({ path: p, status: statusRef.current.get(p) })),
            baseBranch,
          )
          .catch(() => ({}) as Record<string, FileDiffResult>);
        for (const path of missing) {
          const p = batch.then((map) => {
            const diff = map[path];
            return diff ? buildEntry(path, diff) : null;
          });
          inflightRef.current.set(path, p);
          void p.finally(() => {
            if (inflightRef.current.get(path) === p) inflightRef.current.delete(path);
          });
        }
      },
      [projectRoot, mode, baseBranch, buildEntry],
    );

    // Lazily fetch a single file's diff and build its entry, sharing any in-flight
    // batch/single fetch for the same path. The fallback for paths requested
    // outside a batch (e.g. scrollToFile racing the assignment pass).
    const ensureEntry = useCallback(
      async (path: string): Promise<Entry | null> => {
        const existing = entriesRef.current.get(path);
        if (existing?.fetched) return existing;
        const shared = inflightRef.current.get(path);
        if (shared) return shared;
        const p = (async (): Promise<Entry | null> => {
          let diff: FileDiffResult;
          try {
            diff = await REVIEW_SOURCES[mode].fetchDiff(
              projectRoot,
              path,
              baseBranch,
              statusRef.current.get(path),
            );
          } catch {
            return null;
          }
          return buildEntry(path, diff);
        })();
        inflightRef.current.set(path, p);
        try {
          return await p;
        } finally {
          if (inflightRef.current.get(path) === p) inflightRef.current.delete(path);
        }
      },
      [projectRoot, mode, baseBranch, buildEntry],
    );

    // Size a slot's editor to its content and cache the height for the placeholder
    // shown when the editor later recycles away from this file. Never touches
    // scroll: the frame observer keeps the viewport in place as the row resizes.
    const applyLayout = useCallback((slot: Slot) => {
      if (slot.disposed || !slot.path) return;
      const body = frameBodyRef.current.get(slot.path);
      if (!body) return;
      const orig = slot.editor.getOriginalEditor();
      const mod = slot.editor.getModifiedEditor();
      const h = Math.max(40, orig.getContentHeight(), mod.getContentHeight());
      slot.host.style.height = `${h}px`;
      slot.editor.layout({ width: viewportRef.current.width, height: h });
      // Only a revealed slot drives the frame's height; a hidden (settling) one
      // is out of flow, so committing its height would wrongly resize the
      // placeholder before the diff is even shown.
      if (!slot.revealed) return;
      patchRow(slot.path, { height: h });
    }, [patchRow]);

    // The rows to mount for the current scroll position; true when it changed.
    const updateView = useCallback((): boolean => {
      const top = scrollTopRef.current;
      const range = layoutRef.current.range(
        top - MOUNT_MARGIN_PX,
        top + viewportRef.current.height + MOUNT_MARGIN_PX,
      );
      const next = range ? { first: range[0], last: range[1] } : { first: 0, last: -1 };
      const prev = viewRef.current;
      if (!layoutDirtyRef.current && prev.first === next.first && prev.last === next.last) {
        return false;
      }
      layoutDirtyRef.current = false;
      viewRef.current = next;
      setView(next);
      return true;
    }, []);

    // The file occupying the top of the viewport.
    const activePath = useCallback((): string | null => {
      const i = layoutRef.current.indexAt(scrollTopRef.current + 4);
      return i >= 0 ? filesRef.current[i]?.path ?? null : null;
    }, []);

    // A settled editor lays out at its content height. Pure: the frame's
    // ResizeObserver sees the new height and keeps the viewport in place.
    const flushLayouts = useCallback(() => {
      layoutRafRef.current = null;
      const batch = [...pendingLayoutRef.current];
      pendingLayoutRef.current.clear();
      for (const slot of batch) applyLayout(slot);
    }, [applyLayout]);    const scheduleLayout = useCallback(
      (slot: Slot) => {
        pendingLayoutRef.current.add(slot);
        if (layoutRafRef.current != null) return;
        layoutRafRef.current = requestAnimationFrame(flushLayouts);
      },
      [flushLayouts],
    );

    // Move a slot's host back to the hidden holding area and detach its model,
    // preserving the file's view state and unsaved edits (held in the model).
    const parkSlot = useCallback((slot: Slot) => {
      if (slot.disposed) return;
      if (slot.path) {
        const entry = entriesRef.current.get(slot.path);
        if (entry) entry.viewState = slot.editor.saveViewState();
        // Pin the placeholder height synchronously before the host detaches, so
        // the body doesn't collapse to 0 for the frame before React (markRevealed)
        // restores its min-height — a jump the frame observer would then undo.
        if (slot.revealed) {
          const b = frameBodyRef.current.get(slot.path);
          if (b) b.style.minHeight = `${slot.host.offsetHeight}px`;
        }
        markRevealed(slot.path, false);
      }
      slot.subs.forEach((s) => s.dispose());
      slot.subs = [];
      slot.editor.setModel(null);
      slot.host.style.visibility = "";
      slot.host.style.position = "";
      slot.host.style.top = "";
      slot.revealed = false;
      holdingRef.current?.appendChild(slot.host);
      slot.path = null;
      slot.token++;
    }, [markRevealed]);

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
        if (slot.disposed || slot.token !== token) return; // disposed or reassigned mid-fetch
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
        slot.revealed = false;
        // Attach hidden and out of flow so the body keeps showing its placeholder
        // while monaco computes the diff and collapses unchanged regions; the
        // editor measures off-screen and is revealed once, at its final height.
        slot.host.style.width = "100%";
        slot.host.style.position = "absolute";
        slot.host.style.top = "0";
        slot.host.style.visibility = "hidden";
        slot.host.style.height = `${DEFAULT_SLOT_HEIGHT}px`;
        body.appendChild(slot.host);
        editor.setModel({ original: entry.models.original, modified: entry.models.modified });
        // A new file has nothing to compare against, so render it full-width
        // inline instead of wasting half the pane on an empty original. With an
        // empty original the diff would otherwise paint the deleted-side gutter
        // and a phantom removed line down the edge; renderIndicators off drops
        // that gutter and showEmptyDecorations + useTrueInlineView drop the
        // phantom line. The slot is recycled across files, so both modes are set
        // explicitly every attach. Deleted files keep side-by-side (inline would
        // paint the mirror-image inserted-side artifacts).
        const added =
          entry.models.original.getValueLength() === 0 &&
          entry.models.modified.getValueLength() > 0;
        editor.updateOptions({
          readOnly: !entry.editable,
          renderSideBySide: !added && sideBySideRef.current,
          renderIndicators: !added,
          experimental: { useTrueInlineView: added, showEmptyDecorations: !added },
        });
        // The empty original can still leave a stray deleted-gutter cell painted
        // (it varies with hideUnchangedRegions' async passes); a new file has
        // nothing removed, so scope away the delete tint via this host class.
        slot.host.classList.toggle("lpm-diff-added", added);
        // Inline view still renders the empty original's line-number gutter (a lone
        // "1"); a new file has no original lines to number, so collapse that column.
        editor.getOriginalEditor().updateOptions({
          lineNumbers: added ? "off" : "on",
          lineDecorationsWidth: added ? 0 : 10,
        });
        if (entry.viewState) editor.restoreViewState(entry.viewState);
        editor.layout({ width: viewportRef.current.width, height: DEFAULT_SLOT_HEIGHT });

        const orig = editor.getOriginalEditor();
        const mod = editor.getModifiedEditor();

        let quietTimer = 0;
        let maxTimer = 0;
        let fallbackTimer = 0;
        const clearRevealTimers = () => {
          if (quietTimer) clearTimeout(quietTimer);
          if (maxTimer) clearTimeout(maxTimer);
          if (fallbackTimer) clearTimeout(fallbackTimer);
          quietTimer = 0;
          maxTimer = 0;
          fallbackTimer = 0;
        };
        const reveal = () => {
          clearRevealTimers();
          if (slot.disposed || slot.token !== token || slot.revealed || slot.path !== path) return;
          slot.revealed = true;
          const h = Math.max(40, orig.getContentHeight(), mod.getContentHeight());
          // Set the body min-height synchronously too, so a short file doesn't
          // keep the taller placeholder floor for the frame until React drops it.
          slot.host.style.position = "";
          slot.host.style.top = "";
          slot.host.style.visibility = "";
          slot.host.style.height = `${h}px`;
          editor.layout({ width: viewportRef.current.width, height: h });
          body.style.minHeight = `${h}px`;
          patchRow(path, { height: h, revealed: true });
        };
        // Until the worker hands back the diff, the editor holds both files at
        // full height: revealing then would paint every line and pin that height
        // on the placeholder for good. So the timers only start once the diff is
        // in, and the quiet timer re-arms on every settle after that, so we
        // reveal at the FINAL collapsed height, not the first (still-tall) pass.
        const bumpReveal = () => {
          if (slot.revealed || editor.getLineChanges() === null) return;
          if (!maxTimer) maxTimer = window.setTimeout(reveal, REVEAL_MAX_MS);
          if (quietTimer) clearTimeout(quietTimer);
          quietTimer = window.setTimeout(reveal, REVEAL_QUIET_MS);
        };
        fallbackTimer = window.setTimeout(reveal, REVEAL_FALLBACK_MS);
        bumpReveal();

        const onSize = () => {
          if (slot.revealed) scheduleLayout(slot);
          else bumpReveal();
        };
        slot.subs.push(orig.onDidContentSizeChange(onSize));
        slot.subs.push(mod.onDidContentSizeChange(onSize));
        slot.subs.push(
          editor.onDidUpdateDiff(() => {
            if (slot.revealed) scheduleLayout(slot);
            else bumpReveal();
          }),
        );
        slot.subs.push({ dispose: clearRevealTimers });
        slot.subs.push(
          mod.onDidChangeModelContent(() => {
            if (suppressRef.current) return;
            const e = entriesRef.current.get(path);
            if (!e?.models) return;
            setDirty(path, e.models.modified.getAlternativeVersionId() !== e.cleanVersionId);
          }),
        );
      },
      [parkSlot, ensureEntry, scheduleLayout, patchRow, setDirty],
    );

    // Build one pool editor on demand and register it, up to POOL_SIZE. Editors
    // are created lazily (when assignment needs a slot and none is free) instead
    // of all POOL_SIZE up front, so first paint only pays for the editors the
    // viewport actually needs. Born with the current theme and font size; the
    // shared observeMonacoTheme (global setTheme) re-themes it on later flips.
    const createSlot = useCallback((): Slot | null => {
      const monaco = monacoRef.current;
      const holding = holdingRef.current;
      if (!poolLiveRef.current || !monaco || !holding) return null;
      if (slotsRef.current.length >= POOL_SIZE) return null;
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
        fontSize: fontSizeRef.current,
        fontFamily: MONACO_FONT_FAMILY,
        lineNumbers: "on",
        fixedOverflowWidgets: true,
      });
      const slot: Slot = {
        host,
        editor,
        path: null,
        token: 0,
        subs: [],
        revealed: false,
        disposed: false,
      };
      editor
        .getModifiedEditor()
        .addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
          if (slot.path) saveRef.current(slot.path);
        });
      slotsRef.current.push(slot);
      return slot;
    }, []);

    // Assign pool editors to the visible files (document order, capped at the pool
    // size), recycling editors off files that scrolled away and creating new ones
    // (up to the cap) when no free editor is available.
    const flinging = useCallback(() => {
      if (performance.now() - lastScrollEventRef.current > FLING_SETTLE_MS) return false;
      return scrollSampleRef.current.v * FLING_WINDOW_MS > viewportRef.current.height;
    }, []);

    const deferSync = useCallback(() => {
      if (deferredSyncRef.current != null) return;
      deferredSyncRef.current = window.setTimeout(() => {
        deferredSyncRef.current = null;
        syncRef.current();
      }, FLING_RECHECK_MS);
    }, []);

    const syncAssignments = useCallback(() => {
      if (!poolLiveRef.current) return;
      if (flinging()) {
        deferSync();
        return;
      }
      const slots = slotsRef.current;
      // Rows in the viewport first, then the margins: the worker diffs in
      // request order, so what is on screen never waits behind what is not.
      const layout = layoutRef.current;
      const top = scrollTopRef.current;
      const height = viewportRef.current.height;
      const inView = layout.range(top, top + height);
      const inReach = layout.range(top - ASSIGN_MARGIN_PX, top + height + ASSIGN_MARGIN_PX);
      const targets: string[] = [];
      const consider = (i: number) => {
        const path = filesRef.current[i].path;
        const e = entriesRef.current.get(path);
        if (!e?.binary && !e?.tooLarge && !targets.includes(path)) targets.push(path);
      };
      for (let i = inView?.[0] ?? 0; inView && i <= inView[1] && targets.length < POOL_SIZE; i++) {
        consider(i);
      }
      for (let i = inReach?.[0] ?? 0; inReach && i <= inReach[1] && targets.length < POOL_SIZE; i++) {
        consider(i);
      }
      // Fetch every visible target still missing an entry in one batch call; each
      // attachSlot below then resolves from the shared per-path promise.
      fetchBatch(targets);
      const targetSet = new Set(targets);
      const held = new Set(
        slots.map((s) => s.path).filter((p): p is string => !!p && targetSet.has(p)),
      );
      const free = slots.filter((s) => !s.path || !targetSet.has(s.path));
      let fi = 0;
      for (const path of targets) {
        if (held.has(path)) continue;
        let slot = fi < free.length ? free[fi++] : null;
        if (!slot) {
          slot = createSlot();
          if (!slot) break;
        }
        attachSlot(slot, path);
      }
      for (const slot of free.slice(fi)) {
        if (slot.path) parkSlot(slot);
      }
    }, [attachSlot, parkSlot, fetchBatch, createSlot, flinging, deferSync]);
    syncRef.current = syncAssignments;

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
          patchRow(path, { dirty: false, theirs: undefined });
          toast.success("Saved");
        } else {
          patchRow(path, { theirs: res?.currentContent ?? "" });
        }
        savingRef.current.delete(path);
      },
      [projectRoot, patchRow],
    );

    const saveFile = useCallback(
      (path: string) => {
        const entry = entriesRef.current.get(path);
        if (
          !entry?.models ||
          entry.binary ||
          !rowStore.getState().rows[path]?.dirty ||
          !isEditable(path, entry.binary) ||
          savingRef.current.has(path)
        ) {
          return;
        }
        casWrite(path, entry.diskBaseline);
      },
      [casWrite, rowStore, isEditable],
    );
    saveRef.current = saveFile;

    const resolveConflict = useCallback(
      (path: string, kind: ConflictResolution) => {
        const theirs = rowStore.getState().rows[path]?.theirs;
        const entry = entriesRef.current.get(path);
        const dismiss = () => patchRow(path, { theirs: undefined });
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
          patchRow(path, { dirty: false, theirs: undefined });
          return;
        }
        casWrite(path, theirs);
      },
      [rowStore, patchRow, casWrite],
    );
    resolveRef.current = resolveConflict;

    // Stable identities handed to every row so a state change in one file (which
    // re-creates saveFile/resolveConflict via their deps) doesn't invalidate the
    // memo of untouched rows. Each wrapper reads the latest handler through a ref.
    const onSaveRow = useCallback((path: string) => saveRef.current(path), []);
    const onResolveRow = useCallback(
      (path: string, kind: ConflictResolution) => resolveRef.current(path, kind),
      [],
    );

    // Follow disk for clean buffers and raise a conflict for dirty ones, but only
    // for the files currently backed by an editor (the visible window).
    const reconcile = useCallback(async (changedFiles?: string[] | null) => {
      if (!activeRef.current) return;
      const changedSet = Array.isArray(changedFiles)
        ? new Set(changedFiles.map((p) => p.toLowerCase()))
        : null;
      const paths = slotsRef.current
        .map((s) => s.path)
        .filter((p): p is string => !!p)
        .filter((p) => !savingRef.current.has(p))
        .filter((p) => !changedSet || changedSet.has(p.toLowerCase()))
        .filter((p) => {
          const e = entriesRef.current.get(p);
          return !!e?.models && !e.binary;
        });
      if (paths.length === 0) return;
      let map: Record<string, FileDiffResult>;
      try {
        map = await REVIEW_SOURCES[mode].fetchDiffs(
          projectRoot,
          paths.map((path) => ({ path, status: statusRef.current.get(path) })),
          baseBranch,
        );
      } catch {
        return;
      }
      for (const path of paths) {
        const diff = map[path];
        if (!diff) continue;
        if (savingRef.current.has(path)) continue;
        const entry = entriesRef.current.get(path);
        if (!entry?.models || entry.binary) continue;
        if (diff.binary || diff.tooLarge) continue;
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
          patchRow(path, { theirs: disk });
          continue;
        }
        suppressRef.current = true;
        entry.models.modified.setValue(disk);
        suppressRef.current = false;
        entry.diskBaseline = disk;
        entry.cleanVersionId = entry.models.modified.getAlternativeVersionId();
      }
    }, [projectRoot, mode, baseBranch, isEditable, patchRow]);

    useGitChanged(projectRoot, reconcile);
    useEffect(() => {
      if (active) reconcile();
    }, [active, reconcile]);

    // --- editor pool lifecycle ---

    useEffect(() => {
      if (!holdingRef.current) return;
      let cancelled = false;
      const monaco = setupMonaco();
      defineMonacoThemes(monaco);
      monacoRef.current = monaco;
      const disposeTheme = observeMonacoTheme(monaco);
      slotsRef.current = [];
      poolLiveRef.current = true;
      if (!cancelled) setReady(true);
      return () => {
        cancelled = true;
        poolLiveRef.current = false;
        disposeTheme();
        // Dispose every editor that exists at teardown — the eager ones never
        // exist now, so this is exactly the set createSlot built lazily.
        slotsRef.current.forEach((s) => {
          s.disposed = true;
          s.subs.forEach((d) => d.dispose());
          s.subs = [];
          try {
            // Detach the diff model first so hideUnchangedRegions tears down its
            // autoruns before dispose; otherwise they fire against a dead editor.
            s.editor.setModel(null);
            s.editor.dispose();
          } catch {
            // Monaco can throw mid-teardown of its diff observables; ignore.
          }
          s.host.remove();
        });
        slotsRef.current = [];
        entriesRef.current.forEach((e) => {
          try {
            e.models?.original.dispose();
            e.models?.modified.dispose();
          } catch {
            // already disposed
          }
        });
        entriesRef.current.clear();
      };
      // Monaco is set up once; editors are created lazily by syncAssignments and
      // font-size changes are pushed via updateOptions below.
    }, []);

    useEffect(() => {
      slotsRef.current.forEach((s) => s.editor.updateOptions({ fontSize }));
    }, [fontSize]);

    // Push a Split/Unified toggle to every already-attached editor. Added files
    // stay pinned to their true-inline rendering; only normal/modified/deleted
    // files follow the toggle. Content height changes with the layout, so route
    // the re-measure through the shared layout path.
    useEffect(() => {
      for (const slot of slotsRef.current) {
        if (!slot.path) continue;
        const entry = entriesRef.current.get(slot.path);
        if (!entry?.models) continue;
        const added =
          entry.models.original.getValueLength() === 0 &&
          entry.models.modified.getValueLength() > 0;
        slot.editor.updateOptions({ renderSideBySide: !added && sideBySide });
        scheduleLayout(slot);
      }
    }, [sideBySide, scheduleLayout]);

    useEffect(() => {
      if (!onDirtyPathsChange) return;
      onDirtyPathsChange(rowStore.getState().dirtyPaths);
      return rowStore.subscribe((s, prev) => {
        if (s.dirtyPaths !== prev.dirtyPaths) onDirtyPathsChange(s.dirtyPaths);
      });
    }, [rowStore, onDirtyPathsChange]);

    // Runs once per animation frame at most: reads the scroll position (the one
    // DOM read per frame), assigns editors, mounts the rows now in reach, and
    // reports the file under the viewport top.
    const runFrame = useCallback(() => {
      frameRafRef.current = null;
      const c = scrollRef.current;
      if (!c) return;
      const y = c.scrollTop;
      if (sampleVelocityRef.current) {
        sampleVelocityRef.current = false;
        const sample = scrollSampleRef.current;
        const t = performance.now();
        if (sample.t) sample.v = Math.abs(y - sample.y) / Math.max(1, t - sample.t);
        scrollSampleRef.current = { t, y, v: sample.v };
      }
      scrollTopRef.current = y;
      // A changed view assigns from its effect, once the rows are in the DOM.
      if (!updateView()) syncRef.current();
      if (!onActiveFileChange || suppressAnchorRef.current) return;
      const p = activePath();
      if (p && p !== lastActiveRef.current) {
        lastActiveRef.current = p;
        onActiveFileChange(p);
      }
    }, [updateView, activePath, onActiveFileChange]);
    const runFrameRef = useRef(runFrame);
    runFrameRef.current = runFrame;

    const scheduleFrame = useCallback(() => {
      if (frameRafRef.current != null) return;
      frameRafRef.current = requestAnimationFrame(() => runFrameRef.current());
    }, []);

    useEffect(() => {
      if (ready) syncAssignments();
    }, [view, ready, syncAssignments]);

    // Measured row heights feed the layout. A row above the viewport's top row
    // changing height would shove the viewport (WKWebView has no CSS
    // overflow-anchor), so the scroll position moves with it, before paint.
    useEffect(() => {
      const observer = new ResizeObserver((entries) => {
        const layout = layoutRef.current;
        const c = scrollRef.current;
        const anchor = layout.indexAt(scrollTopRef.current);
        let shift = 0;
        let changed = false;
        for (const entry of entries) {
          const el = entry.target as HTMLElement;
          const path = el.dataset.path;
          if (!path) continue;
          const i = layout.indexOf(path);
          if (i < 0) continue;
          const delta = layout.setHeight(path, entry.borderBoxSize?.[0]?.blockSize ?? el.offsetHeight);
          if (delta === 0) continue;
          changed = true;
          if (i < anchor) shift += delta;
        }
        if (!changed) return;
        layoutDirtyRef.current = true;
        if (shift && c && !suppressAnchorRef.current) {
          compensatingRef.current = true;
          c.scrollTop += shift;
          scrollTopRef.current += shift;
          scrollSampleRef.current.y += shift;
        }
        scheduleFrame();
      });
      frameObserverRef.current = observer;
      frameRef.current.forEach((el) => observer.observe(el));
      return () => {
        observer.disconnect();
        frameObserverRef.current = null;
      };
    }, [scheduleFrame]);

    // Drop bookkeeping for files that left the changeset; keep everything else so
    // unsaved edits survive an unrelated list change.
    useEffect(() => {
      const valid = new Set(files.map((f) => f.path));
      const departed = new Set<string>();
      for (const path of [...entriesRef.current.keys()]) {
        if (valid.has(path)) continue;
        departed.add(path);
        const slot = slotsRef.current.find((s) => s.path === path);
        if (slot) parkSlot(slot);
        const entry = entriesRef.current.get(path);
        entry?.models?.original.dispose();
        entry?.models?.modified.dispose();
        entriesRef.current.delete(path);
      }
      for (const path of [...frameRefCbs.current.keys()]) {
        if (!valid.has(path)) frameRefCbs.current.delete(path);
      }
      for (const path of [...frameBodyRefCbs.current.keys()]) {
        if (!valid.has(path)) frameBodyRefCbs.current.delete(path);
      }
      // Prune the row state of departed files too, or a stale classification
      // (e.g. was-binary) lingers if the path returns, and onDirtyPathsChange
      // reports files no longer in the changeset.
      if (departed.size > 0) rowStore.getState().drop(departed);
      scheduleFrame();
    }, [files, parkSlot, rowStore, scheduleFrame]);

    // Relayout attached editors when the container width changes (split drag etc.).
    useEffect(() => {
      const root = scrollRef.current;
      if (!root || typeof ResizeObserver === "undefined") return;
      viewportRef.current = { width: root.clientWidth, height: root.clientHeight };
      scheduleFrame();
      const ro = new ResizeObserver((entries) => {
        const rect = entries[0]?.contentRect;
        if (rect) viewportRef.current = { width: rect.width, height: rect.height };
        slotsRef.current.forEach((s) => {
          if (s.path) scheduleLayout(s);
        });
        scheduleFrame();
      });
      ro.observe(root);
      return () => ro.disconnect();
    }, [scheduleLayout, scheduleFrame]);

    // Drop any queued layout RAF / scroll-suppress timer on unmount so a
    // StrictMode double-mount can't flush against disposed slots.
    useEffect(
      () => () => {
        if (layoutRafRef.current != null) cancelAnimationFrame(layoutRafRef.current);
        layoutRafRef.current = null;
        pendingLayoutRef.current.clear();
        if (scrollSuppressTimerRef.current != null)
          clearTimeout(scrollSuppressTimerRef.current);
        scrollSuppressTimerRef.current = null;
        if (frameRafRef.current != null) cancelAnimationFrame(frameRafRef.current);
        frameRafRef.current = null;
        if (deferredSyncRef.current != null) clearTimeout(deferredSyncRef.current);
        deferredSyncRef.current = null;
      },
      [],
    );

    // A scroll runs the frame; the one our own compensation causes is not a
    // user scroll, so it counts for neither the velocity nor the settle time.
    useEffect(() => {
      const c = scrollRef.current;
      if (!c) return;
      const onScroll = () => {
        if (compensatingRef.current) {
          compensatingRef.current = false;
          return;
        }
        lastScrollEventRef.current = performance.now();
        sampleVelocityRef.current = true;
        scheduleFrame();
      };
      c.addEventListener("scroll", onScroll, { passive: true });
      return () => c.removeEventListener("scroll", onScroll);
    }, [scheduleFrame]);

    useImperativeHandle(
      ref,
      () => ({
        scrollToFile: (path: string) => {
          const c = scrollRef.current;
          const i = layoutRef.current.indexOf(path);
          if (!c || i < 0) return;
          // Let the smooth scroll own scrollTop; resume anchoring once it lands,
          // and land exactly: rows measured on the way may have moved the target.
          suppressAnchorRef.current = true;
          if (scrollSuppressTimerRef.current != null)
            clearTimeout(scrollSuppressTimerRef.current);
          scrollSuppressTimerRef.current = window.setTimeout(() => {
            suppressAnchorRef.current = false;
            scrollSuppressTimerRef.current = null;
            const target = layoutRef.current.top(i);
            if (Math.abs(c.scrollTop - target) > 1) c.scrollTo({ top: target });
          }, 500);
          c.scrollTo({ top: layoutRef.current.top(i), behavior: "smooth" });
        },
      }),
      [],
    );

    // Memoize per path so React invokes the ref only on real mount/unmount; an
    // inline ref is a new function each render, re-observing every frame on
    // unrelated state changes.
    const frameRefCbs = useRef<Map<string, (el: HTMLDivElement | null) => void>>(
      new Map(),
    );
    const frameRefFor = useCallback((path: string) => {
      let cb = frameRefCbs.current.get(path);
      if (!cb) {
        cb = (el: HTMLDivElement | null) => {
          const prev = frameRef.current.get(path);
          if (prev && prev !== el) frameObserverRef.current?.unobserve(prev);
          if (el) {
            frameRef.current.set(path, el);
            frameObserverRef.current?.observe(el);
          } else {
            frameRef.current.delete(path);
          }
        };
        frameRefCbs.current.set(path, cb);
      }
      return cb;
    }, []);

    // Per-path-stable body ref, same reasoning as frameRefFor: a fresh ref
    // callback each render would defeat the row memo and thrash frameBodyRef.
    // A body unmounting (its row scrolled out of reach) hands its editor back
    // first, so no editor is left inside a detached subtree.
    const frameBodyRefCbs = useRef<Map<string, (el: HTMLDivElement | null) => void>>(
      new Map(),
    );
    const frameBodyRefFor = useCallback(
      (path: string) => {
        let cb = frameBodyRefCbs.current.get(path);
        if (!cb) {
          cb = (el: HTMLDivElement | null) => {
            if (el) {
              frameBodyRef.current.set(path, el);
              return;
            }
            frameBodyRef.current.delete(path);
            const slot = slotsRef.current.find((s) => s.path === path);
            if (slot) parkSlot(slot);
          };
          frameBodyRefCbs.current.set(path, cb);
        }
        return cb;
      },
      [parkSlot],
    );

    return (
      <div
        ref={scrollRef}
        className="h-full w-full overflow-y-auto"
        style={{ overflowAnchor: "none" }}
      >
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
          <div
            style={{
              paddingTop: layoutRef.current.top(view.first),
              paddingBottom: layoutRef.current.total() - layoutRef.current.top(view.last + 1),
            }}
          >
            {files.slice(view.first, view.last + 1).map((file) => (
              <DiffPoolRow
                key={`${mode}-${file.path}`}
                path={file.path}
                status={file.status}
                mode={mode}
                excluded={selected ? !selected.has(file.path) : false}
                store={rowStore}
                frameRef={frameRefFor(file.path)}
                bodyRef={frameBodyRefFor(file.path)}
                onSave={onSaveRow}
                onResolve={onResolveRow}
              />
            ))}
          </div>
        )}
      </div>
    );
  },
);
