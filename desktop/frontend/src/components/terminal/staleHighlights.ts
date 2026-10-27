import type { Terminal } from "@xterm/xterm";

// xterm 6.1 betas keep painting some cleared search highlights. The search
// add-on disposes each highlight's marker along with it, which moves the
// marker's line to -1 while xterm's sorted decoration list still holds it, so
// the next removal on that line can miss its entry. The leftover is disposed
// but stays in the per-line index the renderer paints from (row 0 most often).
interface DecorationInternals {
  _core?: {
    _decorationService?: {
      decorations: Iterable<{ isDisposed: boolean; _indexedStartLine?: number }>;
      _lineCache?: {
        getDecorationsOnLine(line: number): ReadonlyArray<unknown> | undefined;
        remove(decoration: unknown): void;
      };
    };
  };
}

export function dropStaleHighlights(term: Terminal | null | undefined): void {
  const service = (term as DecorationInternals | null | undefined)?._core?._decorationService;
  const lineCache = service?._lineCache;
  if (!term || !service || !lineCache) return;
  let dropped = false;
  for (const decoration of service.decorations) {
    const line = decoration._indexedStartLine;
    if (!decoration.isDisposed || line === undefined) continue;
    if (!lineCache.getDecorationsOnLine(line)?.includes(decoration)) continue;
    lineCache.remove(decoration);
    dropped = true;
  }
  if (dropped) term.refresh(0, term.rows - 1);
}
