import { Terminal, type IDisposable, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import type { SerializeAddon } from "@xterm/addon-serialize";
import { handleCopyShortcut, handleNativeCopy } from "./copySelection";
import { readOnlyTerminalYields } from "./terminalKeys";
import { filterLines, stripAnsi } from "./filterLines";
import { foldRepeats, type FoldRow } from "./foldRepeats";
import { toggleLink, writtenCells, type ToggleHit } from "./foldToggle";
import { severityLines, type LogSeverity } from "./logSeverity";
import { MATCH_DECORATIONS } from "./terminalFind";


const LIVE_INTERVAL_MS = 200;
const RESIZE_DEBOUNCE_MS = 200;

export interface FilterMirrorSource {
  term: Terminal;
  serialize: SerializeAddon | null;
}

export interface FilterMirrorFont {
  fontFamily: string;
  lineHeight: number;
}

/** Text to look for, or the errors or warnings a service logged. */
export type FilterSpec = string | { severity: LogSeverity };

function matchLines(text: string, spec: FilterSpec): string[] {
  if (spec === "") return text.split(/\r?\n/);
  return typeof spec === "string" ? filterLines(text, spec) : severityLines(text, spec.severity);
}

function emptyHintFor(spec: FilterSpec): string {
  if (spec === "") return "No output yet";
  if (typeof spec === "string") return "No matches";
  return spec.severity === "error" ? "No errors" : "No warnings";
}

// Read-only xterm overlay that mirrors the lines of `source` matching the query,
// preserving their ANSI colors, with repeated lines folded when asked. The live
// source keeps running beneath it; the mirror re-derives from a fresh serialize
// on each (throttled) write.
export class FilterMirror {
  private mirror: Terminal | null = null;
  private fit: FitAddon | null = null;
  private search: SearchAddon | null = null;
  private host: HTMLDivElement | null = null;
  private emptyHint: HTMLDivElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private writeSub: IDisposable | null = null;
  private resizeTimer = 0;
  private liveTimer = 0;
  private query: FilterSpec = "";
  private fold = false;
  private foldSuspended = false;
  private expanded = new Set<string>();
  // Which rendered line folds or unfolds a run, as of what the mirror shows.
  private toggles = new Map<number, NonNullable<FoldRow["toggle"]>>();
  private lastOutput: string | null = null;
  private lastQuery: FilterSpec = "";
  private active = false;
  private onCount: (count: number) => void = () => {};

  constructor(
    private readonly container: HTMLElement,
    private readonly source: FilterMirrorSource,
    private readonly getTheme: () => ITheme,
    private readonly getFontSize: () => number,
    private readonly getFont: () => FilterMirrorFont,
  ) {}

  setQuery(query: FilterSpec | null, onCount?: (count: number) => void): void {
    if (onCount) this.onCount = onCount;
    this.query = query ?? "";
    this.sync();
  }

  setFold(fold: boolean): void {
    if (this.fold === fold) return;
    this.fold = fold;
    if (!fold) this.expanded.clear();
    this.sync();
  }

  // Set while the pane is off screen or Find is searching every line beneath.
  setFoldSuspended(suspended: boolean): void {
    if (this.foldSuspended === suspended) return;
    this.foldSuspended = suspended;
    this.sync();
  }

  // True while a query is actively filtering the overlay (what the user sees).
  isActive(): boolean {
    return this.active && this.query !== "";
  }

  /** The severity being shown, or null for a text query or none. */
  severity(): LogSeverity | null {
    return this.active && typeof this.query !== "string" ? this.query.severity : null;
  }

  // The matched lines as plain text, recomputed from the live source so it
  // reflects the full filtered set independent of the mirror's rendering.
  getFilteredText(): string {
    if (!this.query) return "";
    return matchLines(this.readSourceText(), this.query)
      .map(stripAnsi)
      .join("\n");
  }

  // Re-derive the overlay from the current source (e.g. after the underlying
  // terminal is cleared, so the filtered view empties too).
  refresh(): void {
    if (this.active && this.showing()) this.run();
  }

  setTheme(theme: ITheme): void {
    if (this.mirror) this.mirror.options.theme = theme;
  }

  setFontSize(size: number): void {
    if (!this.mirror) return;
    this.mirror.options.fontSize = size;
    this.scheduleFit();
  }

  setFont(fontFamily: string, lineHeight: number): void {
    if (!this.mirror) return;
    this.mirror.options.fontFamily = fontFamily;
    this.mirror.options.lineHeight = lineHeight;
    this.scheduleFit();
  }

  dispose(): void {
    this.active = false;
    if (this.resizeTimer) clearTimeout(this.resizeTimer);
    if (this.liveTimer) clearTimeout(this.liveTimer);
    this.writeSub?.dispose();
    this.writeSub = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.search = null;
    this.mirror?.dispose();
    this.mirror = null;
    this.fit = null;
    if (this.host?.parentNode) this.host.parentNode.removeChild(this.host);
    this.host = null;
    this.emptyHint = null;
  }

  private ensure(): void {
    if (this.mirror) return;

    const host = document.createElement("div");
    host.className =
      "absolute inset-0 z-20 overflow-hidden bg-[var(--terminal-bg)]";
    this.container.appendChild(host);
    this.host = host;

    const font = this.getFont();
    const term = new Terminal({
      fontSize: this.getFontSize(),
      fontFamily: font.fontFamily,
      lineHeight: font.lineHeight,
      cursorBlink: false,
      disableStdin: true,
      convertEol: false,
      scrollback: 10000,
      theme: this.getTheme(),
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    let search: SearchAddon | null = null;
    try {
      search = new SearchAddon();
      term.loadAddon(search);
    } catch {}
    term.attachCustomKeyEventHandler(
      (e) => !handleCopyShortcut(e, term, null) && !readOnlyTerminalYields(e),
    );
    host.addEventListener("copy", (e) => handleNativeCopy(e, term, null), true);
    // xterm preventDefaults mousedown without focusing itself, so a selection
    // drag would otherwise leave ⌘C pointed at the previously focused element.
    host.addEventListener("mousedown", () => term.focus());
    term.registerLinkProvider({
      provideLinks: (line, callback) => {
        const hit = this.toggleAt(line);
        callback(hit ? [toggleLink(hit, line)] : undefined);
      },
    });
    // Not the link's own activate: every live re-render drops the link under a
    // pointer that hasn't moved, so on a busy log it would rarely be there.
    host.addEventListener("click", (e) => this.handleClick(e));
    term.open(host);

    this.mirror = term;
    this.fit = fit;
    this.search = search;

    const hint = document.createElement("div");
    hint.className =
      "pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-[var(--text-muted)]";
    hint.textContent = "No matches";
    hint.style.display = "none";
    host.appendChild(hint);
    this.emptyHint = hint;

    const ro = new ResizeObserver(() => this.scheduleFit(true));
    ro.observe(host);
    this.resizeObserver = ro;
  }

  private subscribeLive(): void {
    if (this.writeSub) return;
    this.writeSub = this.source.term.onWriteParsed(() => {
      // A timer already set keeps its time, so a log that never pauses still shows.
      if (!this.active || this.liveTimer) return;
      this.liveTimer = window.setTimeout(() => {
        this.liveTimer = 0;
        this.run();
      }, LIVE_INTERVAL_MS);
    });
  }

  private scheduleFit(rerun = false): void {
    if (this.resizeTimer) clearTimeout(this.resizeTimer);
    this.resizeTimer = window.setTimeout(() => {
      this.resizeTimer = 0;
      const host = this.host;
      if (!host || !host.clientWidth || !host.clientHeight) return;
      try {
        this.fit?.fit();
      } catch {}
      if (rerun) this.run();
    }, RESIZE_DEBOUNCE_MS);
  }

  private readSourceText(): string {
    const { serialize, term } = this.source;
    if (serialize) {
      try {
        return serialize.serialize({ excludeModes: true, excludeAltBuffer: true });
      } catch {}
    }
    const buf = term.buffer.active;
    const out: string[] = [];
    for (let y = 0; y < buf.length; y++) {
      const line = buf.getLine(y);
      out.push(line ? line.translateToString(true) : "");
    }
    return out.join("\n");
  }

  private run(): void {
    const mirror = this.mirror;
    if (!mirror || !this.showing()) return;

    const query = this.query;
    const lines = matchLines(this.readSourceText(), query);
    const rows: FoldRow[] = this.foldShowing() ? foldRepeats(lines, this.expanded) : lines.map((text) => ({ text }));
    const output = rows.map((row) => row.text).join("\r\n");
    this.onCount(lines.length);
    if (output === this.lastOutput && query === this.lastQuery) return;
    this.lastOutput = output;
    this.lastQuery = query;

    try {
      this.search?.clearDecorations();
    } catch {}
    const buffer = mirror.buffer.active;
    const atBottom = buffer.viewportY >= buffer.baseY;
    const top = buffer.viewportY;
    // Reset (ESC c) in the write itself: reset() runs at once, ahead of a write
    // the previous run still has queued, which would then land before this one.
    mirror.write(`\x1bc\x1b[?25l${output}`, () => {
      this.toggles = new Map(rows.flatMap((row, i) => (row.toggle ? [[i, row.toggle] as const] : [])));
      if (!lines.length) return;
      try {
        if (typeof query === "string" && query) this.search?.findNext(query, { decorations: MATCH_DECORATIONS });
      } catch {}
      // Follow the newest lines, like `tail -f | grep`, unless scrolled up to read.
      if (atBottom) mirror.scrollToBottom();
      else mirror.scrollToLine(top);
    });

    if (this.emptyHint) {
      this.emptyHint.textContent = emptyHintFor(query);
      this.emptyHint.style.display = lines.length ? "none" : "flex";
    }
    try {
      this.fit?.fit();
    } catch {}
  }

  private foldShowing(): boolean {
    return this.fold && !this.foldSuspended;
  }

  private showing(): boolean {
    return this.query !== "" || this.foldShowing();
  }

  private sync(): void {
    if (!this.showing()) {
      this.hide();
      return;
    }
    this.ensure();
    this.active = true;
    if (this.host) this.host.style.display = "block";
    this.subscribeLive();
    this.run();
  }

  // The count at the end of a folded row, or the row above an unfolded run.
  // `line` is 1-based, and a rendered line may wrap over several rows; its
  // toggle sits at the end of the last.
  private toggleAt(line: number): ToggleHit | null {
    if (!this.mirror || this.toggles.size === 0) return null;
    const buffer = this.mirror.buffer.active;
    const row = buffer.getLine(line - 1);
    if (!row || buffer.getLine(line)?.isWrapped) return null;
    let rendered = -1;
    for (let y = 0; y < line; y++) {
      if (!buffer.getLine(y)?.isWrapped) rendered++;
    }
    const toggle = this.toggles.get(rendered);
    if (!toggle) return null;
    const end = writtenCells(row);
    return { key: toggle.key, start: Math.max(1, end - toggle.cells + 1), end };
  }

  private handleClick(e: MouseEvent): void {
    const mirror = this.mirror;
    const screen = mirror?.element?.querySelector(".xterm-screen");
    if (!mirror || !screen || mirror.hasSelection()) return;
    const rect = screen.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = Math.floor((e.clientX - rect.left) / (rect.width / mirror.cols)) + 1;
    const line = Math.floor((e.clientY - rect.top) / (rect.height / mirror.rows)) + mirror.buffer.active.viewportY + 1;
    const hit = this.toggleAt(line);
    if (hit && x >= hit.start && x <= hit.end) this.toggleRun(hit.key);
  }

  private toggleRun(key: string): void {
    if (!this.expanded.delete(key)) this.expanded.add(key);
    this.run();
  }

  private hide(): void {
    this.active = false;
    if (this.liveTimer) {
      clearTimeout(this.liveTimer);
      this.liveTimer = 0;
    }
    if (this.host) this.host.style.display = "none";
  }
}

interface FilterMirrorHost extends FilterMirrorSource {
  search?: { clearDecorations(): void } | null;
}

export function ensureFilterMirror(
  filterRef: { current: FilterMirror | null },
  container: HTMLElement,
  source: FilterMirrorSource,
  getTheme: () => ITheme,
  getFontSize: () => number,
  getFont: () => FilterMirrorFont,
): FilterMirror {
  filterRef.current ??= new FilterMirror(container, source, getTheme, getFontSize, getFont);
  return filterRef.current;
}

export function applyFilterQuery(
  filterRef: { current: FilterMirror | null },
  container: HTMLElement,
  source: FilterMirrorHost,
  getTheme: () => ITheme,
  getFontSize: () => number,
  getFont: () => FilterMirrorFont,
  query: FilterSpec | null,
  onCount?: (count: number) => void,
): void {
  if (!query && !filterRef.current) return;
  source.search?.clearDecorations();
  ensureFilterMirror(filterRef, container, source, getTheme, getFontSize, getFont).setQuery(query, onCount);
}
