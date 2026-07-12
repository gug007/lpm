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
import { toast } from "../../toast";
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

// A frame pinned across a height change: keep this file's top edge a fixed
// distance below the scroll-container top so settling editors don't move it.
type ScrollAnchor = { path: string; offset: number };

const POOL_SIZE = 10;
const LAZY_ROOT_MARGIN_PX = 500;
const DEFAULT_SLOT_HEIGHT = 220;
// Reveal once the editor stops resizing for this long (hideUnchangedRegions
// collapses in several passes, so we wait for quiet, not the first event)...
const REVEAL_QUIET_MS = 70;
// ...but never wait longer than this, so a never-quiet file still reveals.
const REVEAL_MAX_MS = 500;

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
  // Reports how many files have unsaved edits, so a host can warn before
  // discarding them (e.g. the commit modal on close).
  onDirtyCountChange?: (count: number) => void;
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
      onDirtyCountChange,
    },
    ref,
  ) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const holdingRef = useRef<HTMLDivElement>(null);
    const frameBodyRef = useRef<Map<string, HTMLDivElement>>(new Map());
    const frameRef = useRef<Map<string, HTMLDivElement>>(new Map());
    const observerRef = useRef<IntersectionObserver | null>(null);
    const monacoRef = useRef<Monaco | null>(null);
    // True only while the pool mount effect is live. Guards lazy slot creation so
    // a torn-down (StrictMode remount) instance can never build editors.
    const poolLiveRef = useRef(false);
    const slotsRef = useRef<Slot[]>([]);
    const entriesRef = useRef<Map<string, Entry>>(new Map());
    // Shared in-flight fetch per path so a batch fetch and a stray single-file
    // fetch for the same file never both build an entry.
    const inflightRef = useRef<Map<string, Promise<Entry | null>>>(new Map());
    const visibleRef = useRef<Set<string>>(new Set());
    const suppressRef = useRef(false);
    const savingRef = useRef<Set<string>>(new Set());
    const pendingLayoutRef = useRef<Set<Slot>>(new Set());
    const layoutRafRef = useRef<number | null>(null);
    const suppressAnchorRef = useRef(false);
    const scrollSuppressTimerRef = useRef<number | null>(null);
    const spyRafRef = useRef<number | null>(null);
    const lastActiveRef = useRef<string | null>(null);
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

    const [ready, setReady] = useState(false);
    const [heights, setHeights] = useState<Map<string, number>>(new Map());
    const [revealed, setRevealed] = useState<Set<string>>(new Set());
    const [dirtyPaths, setDirtyPaths] = useState<Set<string>>(new Set());
    const [binaryPaths, setBinaryPaths] = useState<Set<string>>(new Set());
    const [tooLargePaths, setTooLargePaths] = useState<Set<string>>(new Set());
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

    const markRevealed = useCallback((path: string, on: boolean) => {
      setRevealed((prev) => {
        if (on === prev.has(path)) return prev;
        const next = new Set(prev);
        if (on) next.add(path);
        else next.delete(path);
        return next;
      });
    }, []);

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
        if (binary) {
          setBinaryPaths((prev) => (prev.has(path) ? prev : new Set(prev).add(path)));
        }
        if (tooLarge) {
          setTooLargePaths((prev) => (prev.has(path) ? prev : new Set(prev).add(path)));
        }
        return entry;
      },
      [mode, authority, isEditable],
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
    // outside a batch (e.g. scrollToFile racing the intersection observer).
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
    // shown when the editor later recycles away from this file. Pure: never touches
    // scroll — that is the scheduler's job, so it can anchor around the change.
    const applyLayout = useCallback((slot: Slot) => {
      if (slot.disposed || !slot.path) return;
      const body = frameBodyRef.current.get(slot.path);
      if (!body) return;
      const orig = slot.editor.getOriginalEditor();
      const mod = slot.editor.getModifiedEditor();
      const h = Math.max(40, orig.getContentHeight(), mod.getContentHeight());
      slot.host.style.height = `${h}px`;
      slot.editor.layout({ width: body.clientWidth, height: h });
      // Only a revealed slot drives the frame's height; a hidden (settling) one
      // is out of flow, so committing its height would wrongly resize the
      // placeholder before the diff is even shown.
      if (!slot.revealed) return;
      const path = slot.path;
      setHeights((prev) => (prev.get(path) === h ? prev : new Map(prev).set(path, h)));
    }, []);

    // Manual scroll anchoring. WKWebView (macOS Safari ≤26) has no CSS
    // overflow-anchor, so when a diff frame settles shorter — monaco collapses
    // hideUnchangedRegions asynchronously after its worker diff, firing
    // onDidContentSizeChange/onDidUpdateDiff several times — content above the
    // viewport shrinks and scrollTop is clamped upward, snapping the user away
    // from the bottom. Pin the topmost visible frame across every height change.
    // Resolve a binary-search midpoint to the nearest frame that has a live DOM
    // element, searching outward but staying within [lo, hi]. Frames render in
    // document order so their rects are monotonic; a path whose element is
    // transiently missing is skipped rather than treated as a boundary.
    const probeFrame = useCallback(
      (mid: number, lo: number, hi: number): { idx: number; rect: DOMRect } | null => {
        const files = filesRef.current;
        for (let d = 0; ; d++) {
          const a = mid + d;
          const b = mid - d;
          const aIn = a <= hi;
          const bIn = b >= lo;
          if (!aIn && !bIn) return null;
          if (aIn) {
            const el = frameRef.current.get(files[a].path);
            if (el) return { idx: a, rect: el.getBoundingClientRect() };
          }
          if (bIn && b !== a) {
            const el = frameRef.current.get(files[b].path);
            if (el) return { idx: b, rect: el.getBoundingClientRect() };
          }
        }
      },
      [],
    );

    const captureAnchor = useCallback((): ScrollAnchor | null => {
      const c = scrollRef.current;
      if (!c) return null;
      const top = c.getBoundingClientRect().top;
      // First frame (document order) whose bottom edge is still below the
      // container top: the topmost one with anything left in view.
      let lo = 0;
      let hi = filesRef.current.length - 1;
      let ans = -1;
      let ansRect: DOMRect | null = null;
      while (lo <= hi) {
        const probe = probeFrame((lo + hi) >> 1, lo, hi);
        if (!probe) break;
        if (probe.rect.bottom > top + 1) {
          ans = probe.idx;
          ansRect = probe.rect;
          hi = probe.idx - 1;
        } else {
          lo = probe.idx + 1;
        }
      }
      if (ans < 0 || !ansRect) return null;
      return { path: filesRef.current[ans].path, offset: ansRect.top - top };
    }, [probeFrame]);

    const restoreAnchor = useCallback((anchor: ScrollAnchor | null) => {
      const c = scrollRef.current;
      if (!c || !anchor) return;
      const el = frameRef.current.get(anchor.path);
      if (!el) return;
      const top = c.getBoundingClientRect().top;
      const delta = el.getBoundingClientRect().top - top - anchor.offset;
      if (delta) c.scrollTop += delta;
    }, []);

    // The file occupying the top of the viewport: the last one (document order)
    // whose frame top has scrolled to or above the container's top edge.
    const activePath = useCallback((): string | null => {
      const c = scrollRef.current;
      if (!c) return null;
      const top = c.getBoundingClientRect().top + 4;
      // Last frame (document order) whose top edge has scrolled to or above the
      // container top: the file occupying the top of the viewport.
      let lo = 0;
      let hi = filesRef.current.length - 1;
      let ans = -1;
      while (lo <= hi) {
        const probe = probeFrame((lo + hi) >> 1, lo, hi);
        if (!probe) break;
        if (probe.rect.top <= top) {
          ans = probe.idx;
          lo = probe.idx + 1;
        } else {
          hi = probe.idx - 1;
        }
      }
      const candidate = ans >= 0 ? filesRef.current[ans].path : null;
      return candidate ?? filesRef.current[0]?.path ?? null;
    }, [probeFrame]);

    // Coalesce a burst of settles into one reflow: capture before, apply all, then
    // restore so the cumulative height change above the anchor is corrected once.
    const flushLayouts = useCallback(() => {
      layoutRafRef.current = null;
      const batch = [...pendingLayoutRef.current];
      pendingLayoutRef.current.clear();
      if (batch.length === 0) return;
      const anchor = suppressAnchorRef.current ? null : captureAnchor();
      for (const slot of batch) applyLayout(slot);
      restoreAnchor(anchor);
    }, [captureAnchor, restoreAnchor, applyLayout]);

    const scheduleLayout = useCallback(
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
        // restores its min-height — an unanchored jump when parking above the fold.
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
        editor.layout({ width: body.clientWidth, height: DEFAULT_SLOT_HEIGHT });

        const orig = editor.getOriginalEditor();
        const mod = editor.getModifiedEditor();

        let quietTimer = 0;
        let maxTimer = 0;
        const clearRevealTimers = () => {
          if (quietTimer) clearTimeout(quietTimer);
          if (maxTimer) clearTimeout(maxTimer);
          quietTimer = 0;
          maxTimer = 0;
        };
        const reveal = () => {
          clearRevealTimers();
          if (slot.disposed || slot.token !== token || slot.revealed || slot.path !== path) return;
          slot.revealed = true;
          const h = Math.max(40, orig.getContentHeight(), mod.getContentHeight());
          // Anchor the placeholder→editor swap so a file that settles while above
          // the viewport (fast up-scroll, slow diff) doesn't shove content. Set the
          // body min-height synchronously too, so a short file doesn't keep the
          // taller placeholder floor for the frame until React drops it.
          const anchor = suppressAnchorRef.current ? null : captureAnchor();
          slot.host.style.position = "";
          slot.host.style.top = "";
          slot.host.style.visibility = "";
          slot.host.style.height = `${h}px`;
          editor.layout({ width: body.clientWidth, height: h });
          body.style.minHeight = `${h}px`;
          restoreAnchor(anchor);
          setHeights((prev) => (prev.get(path) === h ? prev : new Map(prev).set(path, h)));
          markRevealed(path, true);
        };
        // Re-arm the quiet timer on every settle so we reveal at the FINAL
        // collapsed height, not the first (still-tall) pass.
        const bumpReveal = () => {
          if (slot.revealed) return;
          if (quietTimer) clearTimeout(quietTimer);
          quietTimer = window.setTimeout(reveal, REVEAL_QUIET_MS);
        };
        maxTimer = window.setTimeout(reveal, REVEAL_MAX_MS);
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
      [parkSlot, ensureEntry, scheduleLayout, markRevealed, setDirty, captureAnchor, restoreAnchor],
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
    const syncAssignments = useCallback(() => {
      if (!poolLiveRef.current) return;
      const slots = slotsRef.current;
      const targets = filesRef.current
        .map((f) => f.path)
        .filter((p) => {
          if (!visibleRef.current.has(p)) return false;
          const e = entriesRef.current.get(p);
          return !e?.binary && !e?.tooLarge;
        })
        .slice(0, POOL_SIZE);
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
    }, [attachSlot, parkSlot, fetchBatch, createSlot]);

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
      (path: string, kind: ConflictResolution) => {
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
    // the re-measure through the shared anchored layout path.
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
      onDirtyCountChange?.(dirtyPaths.size);
    }, [dirtyPaths, onDirtyCountChange]);

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
        visibleRef.current.delete(path);
      }
      for (const path of [...frameRefCbs.current.keys()]) {
        if (!valid.has(path)) frameRefCbs.current.delete(path);
      }
      for (const path of [...frameBodyRefCbs.current.keys()]) {
        if (!valid.has(path)) frameBodyRefCbs.current.delete(path);
      }
      // Prune per-file React state for departed files too, or a stale
      // classification (e.g. was-binary) lingers if the path returns, and
      // onDirtyCountChange counts files no longer in the changeset.
      if (departed.size > 0) {
        const dropFromSet = (prev: Set<string>) => {
          let changed = false;
          const next = new Set(prev);
          for (const p of departed) if (next.delete(p)) changed = true;
          return changed ? next : prev;
        };
        const dropFromMap = <V,>(prev: Map<string, V>) => {
          let changed = false;
          const next = new Map(prev);
          for (const p of departed) if (next.delete(p)) changed = true;
          return changed ? next : prev;
        };
        setDirtyPaths(dropFromSet);
        setBinaryPaths(dropFromSet);
        setTooLargePaths(dropFromSet);
        setRevealed(dropFromSet);
        setConflicts(dropFromMap);
        setHeights(dropFromMap);
      }
      if (ready) syncAssignments();
    }, [files, ready, parkSlot, syncAssignments]);

    // Relayout attached editors when the container width changes (split drag etc.).
    useEffect(() => {
      const root = scrollRef.current;
      if (!root || typeof ResizeObserver === "undefined") return;
      const ro = new ResizeObserver(() => {
        slotsRef.current.forEach((s) => {
          if (s.path) scheduleLayout(s);
        });
      });
      ro.observe(root);
      return () => ro.disconnect();
    }, [scheduleLayout]);

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
        if (spyRafRef.current != null) cancelAnimationFrame(spyRafRef.current);
        spyRafRef.current = null;
      },
      [],
    );

    // Scroll-spy: highlight the file under the viewport top in the changes tree.
    // Skipped while a programmatic scrollToFile animates (suppressAnchorRef) so the
    // tree doesn't strobe through every file the smooth scroll passes.
    useEffect(() => {
      const c = scrollRef.current;
      if (!c || !onActiveFileChange) return;
      const onScroll = () => {
        if (spyRafRef.current != null) return;
        spyRafRef.current = requestAnimationFrame(() => {
          spyRafRef.current = null;
          if (suppressAnchorRef.current) return;
          const p = activePath();
          if (p && p !== lastActiveRef.current) {
            lastActiveRef.current = p;
            onActiveFileChange(p);
          }
        });
      };
      c.addEventListener("scroll", onScroll, { passive: true });
      return () => c.removeEventListener("scroll", onScroll);
    }, [onActiveFileChange, activePath]);

    useImperativeHandle(
      ref,
      () => ({
        scrollToFile: (path: string) => {
          if (!visibleRef.current.has(path)) {
            visibleRef.current.add(path);
            syncAssignments();
          }
          // Let the smooth scroll own scrollTop; resume anchoring once it lands so
          // a neighbor settling mid-flight can't yank the animation off target.
          suppressAnchorRef.current = true;
          if (scrollSuppressTimerRef.current != null)
            clearTimeout(scrollSuppressTimerRef.current);
          scrollSuppressTimerRef.current = window.setTimeout(() => {
            suppressAnchorRef.current = false;
            scrollSuppressTimerRef.current = null;
          }, 500);
          requestAnimationFrame(() => {
            frameRef.current.get(path)?.scrollIntoView({ behavior: "smooth", block: "start" });
          });
        },
      }),
      [syncAssignments],
    );

    // Memoize per path so React invokes the ref only on real mount/unmount; an
    // inline ref is a new function each render, re-observing every frame (and
    // re-delivering IntersectionObserver entries) on unrelated state changes.
    const frameRefCbs = useRef<Map<string, (el: HTMLDivElement | null) => void>>(
      new Map(),
    );
    const frameRefFor = useCallback((path: string) => {
      let cb = frameRefCbs.current.get(path);
      if (!cb) {
        cb = (el: HTMLDivElement | null) => {
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
        };
        frameRefCbs.current.set(path, cb);
      }
      return cb;
    }, []);

    // Per-path-stable body ref, same reasoning as frameRefFor: a fresh ref
    // callback each render would defeat the row memo and thrash frameBodyRef.
    const frameBodyRefCbs = useRef<Map<string, (el: HTMLDivElement | null) => void>>(
      new Map(),
    );
    const frameBodyRefFor = useCallback((path: string) => {
      let cb = frameBodyRefCbs.current.get(path);
      if (!cb) {
        cb = (el: HTMLDivElement | null) => {
          if (el) frameBodyRef.current.set(path, el);
          else frameBodyRef.current.delete(path);
        };
        frameBodyRefCbs.current.set(path, cb);
      }
      return cb;
    }, []);

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
          files.map((file) => {
            const path = file.path;
            const isBinary = binaryPaths.has(path);
            const isTooLarge = tooLargePaths.has(path);
            return (
              <DiffPoolRow
                key={`${mode}-${path}`}
                path={path}
                status={file.status}
                dirty={dirtyPaths.has(path)}
                editable={isEditable(path, isBinary || isTooLarge)}
                binary={isBinary}
                tooLarge={isTooLarge}
                revealed={revealed.has(path)}
                excluded={selected ? !selected.has(path) : false}
                theirs={conflicts.get(path)}
                placeholderHeight={slotHeight(path)}
                frameRef={frameRefFor(path)}
                bodyRef={frameBodyRefFor(path)}
                onSave={onSaveRow}
                onResolve={onResolveRow}
              />
            );
          })
        )}
      </div>
    );
  },
);
