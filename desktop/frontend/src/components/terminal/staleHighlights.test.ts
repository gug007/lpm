import { describe, expect, it, vi } from "vitest";
import type { Terminal } from "@xterm/xterm";
import { dropStaleHighlights } from "./staleHighlights";

type FakeDecoration = { isDisposed: boolean; _indexedStartLine?: number };

function fakeTerm(decorations: FakeDecoration[]) {
  const byLine = new Map<number, FakeDecoration[]>();
  for (const d of decorations) {
    if (d._indexedStartLine === undefined) continue;
    byLine.set(d._indexedStartLine, [...(byLine.get(d._indexedStartLine) ?? []), d]);
  }
  const lineCache = {
    getDecorationsOnLine: (line: number) => byLine.get(line),
    remove: vi.fn((d: FakeDecoration) => {
      const bucket = byLine.get(d._indexedStartLine!) ?? [];
      byLine.set(d._indexedStartLine!, bucket.filter((x) => x !== d));
    }),
  };
  const term = {
    rows: 24,
    refresh: vi.fn(),
    _core: { _decorationService: { decorations: decorations, _lineCache: lineCache } },
  };
  return { term: term as unknown as Terminal & typeof term, lineCache };
}

describe("dropStaleHighlights", () => {
  it("unpaints disposed highlights still in the line index, and keeps live ones", () => {
    const stale = { isDisposed: true, _indexedStartLine: 0 };
    const live = { isDisposed: false, _indexedStartLine: 0 };
    const { term, lineCache } = fakeTerm([stale, live]);
    dropStaleHighlights(term);
    expect(lineCache.remove).toHaveBeenCalledWith(stale);
    expect(lineCache.getDecorationsOnLine(0)).toEqual([live]);
    expect(term.refresh).toHaveBeenCalledWith(0, 23);
  });

  it("repaints nothing when no leftover is drawn", () => {
    const { term, lineCache } = fakeTerm([{ isDisposed: false, _indexedStartLine: 2 }]);
    dropStaleHighlights(term);
    dropStaleHighlights(null);
    expect(lineCache.remove).not.toHaveBeenCalled();
    expect(term.refresh).not.toHaveBeenCalled();
  });

  it("does nothing on a terminal without those internals", () => {
    expect(() => dropStaleHighlights({ rows: 2, refresh: vi.fn() } as unknown as Terminal)).not.toThrow();
  });
});
