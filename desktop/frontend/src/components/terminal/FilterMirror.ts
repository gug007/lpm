import { Terminal, type IDisposable, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import type { SerializeAddon } from "@xterm/addon-serialize";
import { handleCopyShortcut, handleNativeCopy } from "./copySelection";
import { readOnlyTerminalYields } from "./terminalKeys";
import { filterLines, stripAnsi } from "./filterLines";
import { severityLines, type LogSeverity } from "./logSeverity";
import { MATCH_DECORATIONS } from "./terminalFind";


const LIVE_DEBOUNCE_MS = 120;
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
  return typeof spec === "string" ? filterLines(text, spec) : severityLines(text, spec.severity);
}

function emptyHintFor(spec: FilterSpec): string {
  if (typeof spec === "string") return "No matches";
  return spec.severity === "error" ? "No errors" : "No warnings";
}

// Read-only xterm overlay that mirrors only the lines of `source` matching the
// query, preserving their ANSI colors. The live source keeps running beneath
// it; the mirror re-derives from a fresh serialize on each (debounced) write.
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
    if (!this.query) {
      this.hide();
      return;
    }
    this.ensure();
    this.active = true;
    if (this.host) this.host.style.display = "block";
    this.subscribeLive();
    this.run();
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
    if (this.active && this.query) this.run();
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
      if (!this.active) return;
      if (this.liveTimer) clearTimeout(this.liveTimer);
      this.liveTimer = window.setTimeout(() => {
        this.liveTimer = 0;
        this.run();
      }, LIVE_DEBOUNCE_MS);
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
        return serialize.serialize();
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
    if (!mirror || !this.query) return;

    const query = this.query;
    const lines = matchLines(this.readSourceText(), query);

    try {
      this.search?.clearDecorations();
    } catch {}
    // Reset (ESC c) in the write itself: reset() runs at once, ahead of a write
    // the previous run still has queued, which would then land before this one.
    mirror.write(`\x1bc${lines.join("\r\n")}`, () => {
      if (!lines.length) return;
      try {
        if (typeof query === "string") this.search?.findNext(query, { decorations: MATCH_DECORATIONS });
      } catch {}
      // Follow the newest matches, like `tail -f | grep`.
      mirror.scrollToBottom();
    });

    if (this.emptyHint) {
      this.emptyHint.textContent = emptyHintFor(query);
      this.emptyHint.style.display = lines.length ? "none" : "flex";
    }
    try {
      this.fit?.fit();
    } catch {}
    this.onCount(lines.length);
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
  if (!filterRef.current) {
    filterRef.current = new FilterMirror(
      container,
      source,
      getTheme,
      getFontSize,
      getFont,
    );
  }
  filterRef.current.setQuery(query, onCount);
}
