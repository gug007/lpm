import { describe, expect, it, vi } from "vitest";
import type { SearchAddon } from "@xterm/addon-search";
import type { Terminal } from "@xterm/xterm";
import { clearFind, findResultsLabel, MATCH_DECORATIONS, runFind, watchFindResults } from "./terminalFind";

const term = { rows: 24, refresh: vi.fn() } as unknown as Terminal;
const target = (search: SearchAddon) => ({ term, search });

function fakeSearch(overrides: Partial<Record<keyof SearchAddon, unknown>> = {}) {
  return {
    findNext: vi.fn(() => true),
    findPrevious: vi.fn(() => false),
    clearDecorations: vi.fn(),
    onDidChangeResults: vi.fn(() => ({ dispose: vi.fn() })),
    ...overrides,
  } as unknown as SearchAddon & Record<string, ReturnType<typeof vi.fn>>;
}

describe("runFind", () => {
  it("searches with the options and match highlighting, so the add-on counts", () => {
    const search = fakeSearch();
    expect(runFind(target(search), "error", "next", { caseSensitive: true, regex: false })).toBe("found");
    expect(search.findNext).toHaveBeenCalledWith("error", {
      caseSensitive: true,
      regex: false,
      decorations: MATCH_DECORATIONS,
    });
  });

  it("goes backwards for prev and reports a miss", () => {
    const search = fakeSearch();
    expect(runFind(target(search), "error", "prev", { caseSensitive: false, regex: false })).toBe("none");
    expect(search.findPrevious).toHaveBeenCalled();
  });

  it("reports an unfinished regular expression instead of throwing, and drops the highlights", () => {
    const search = fakeSearch({
      findNext: vi.fn(() => {
        throw new SyntaxError("Invalid regular expression: /a(/: Unterminated group");
      }),
    });
    expect(runFind(target(search), "a(", "next", { caseSensitive: false, regex: true })).toBe("invalid");
    expect(search.clearDecorations).toHaveBeenCalled();
  });

  it("drops the old highlights when only the options change", () => {
    const search = fakeSearch();
    runFind(target(search), "compiled", "next", { caseSensitive: false, regex: false });
    runFind(target(search), "compiled", "next", { caseSensitive: false, regex: false });
    expect(search.clearDecorations).not.toHaveBeenCalled();
    runFind(target(search), "compiled", "next", { caseSensitive: true, regex: false });
    expect(search.clearDecorations).toHaveBeenCalledTimes(1);
  });

  it("finds nothing before the terminal has a search add-on", () => {
    expect(runFind(null, "error", "next", { caseSensitive: false, regex: false })).toBe("none");
  });
});

describe("clearFind", () => {
  it("drops the highlights and does nothing without a search add-on", () => {
    const search = fakeSearch();
    clearFind(target(search));
    clearFind(null);
    expect(search.clearDecorations).toHaveBeenCalledTimes(1);
  });
});

describe("watchFindResults", () => {
  it("passes the add-on's results on and stops when unsubscribed", () => {
    const dispose = vi.fn();
    let fire: (e: { resultIndex: number; resultCount: number }) => void = () => {};
    const search = fakeSearch({
      onDidChangeResults: vi.fn((cb: typeof fire) => {
        fire = cb;
        return { dispose };
      }),
    });
    const seen: unknown[] = [];
    const stop = watchFindResults(target(search), (r) => seen.push(r));
    fire({ resultIndex: 2, resultCount: 7 });
    expect(seen).toEqual([{ index: 2, count: 7 }]);
    stop();
    expect(dispose).toHaveBeenCalled();
  });
});

describe("findResultsLabel", () => {
  it("counts from one", () => {
    expect(findResultsLabel({ index: 0, count: 2 })).toBe("1 of 2");
  });

  it("says when there are none", () => {
    expect(findResultsLabel({ index: -1, count: 0 })).toBe("No matches");
  });

  it("caps the total where the add-on stops counting", () => {
    expect(findResultsLabel({ index: 4, count: 1000 })).toBe("5 of 1000+");
    expect(findResultsLabel({ index: -1, count: 1000 })).toBe("1000+ matches");
  });

  it("gives the total alone when no match is selected", () => {
    expect(findResultsLabel({ index: -1, count: 1 })).toBe("1 match");
    expect(findResultsLabel({ index: -1, count: 3 })).toBe("3 matches");
  });
});
