import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const saveTextFile = vi.fn(
  (_name: string, _text: string): Promise<boolean> => Promise.resolve(true),
);
vi.mock("../../../bridge/commands", () => ({
  SaveTextFile: (name: string, text: string) => saveTextFile(name, text),
}));

import { copyConsole, saveConsole } from "./consoleActions";

// Minimal xterm-buffer stand-in: bufferToPlainText reads buffer.active.
function fakeTerm(lines: string[]) {
  return {
    buffer: {
      active: {
        length: lines.length,
        getLine: (i: number) => ({ translateToString: () => lines[i] }),
      },
    },
  } as never;
}

let written: string | null;

beforeEach(() => {
  written = null;
  saveTextFile.mockClear();
  vi.stubGlobal("navigator", {
    clipboard: {
      writeText: vi.fn(async (t: string) => {
        written = t;
      }),
    },
  });
});

describe("copyConsole respects an active filter", () => {
  it("copies ONLY the filtered text when the filter is active", async () => {
    const term = fakeTerm(["noise 1", "noise 2", "the match"]);
    const filter = { isActive: () => true, getFilteredText: () => "the match" };
    await copyConsole(term, filter);
    expect(written).toBe("the match");
  });

  it("copies the full buffer when there is no filter", async () => {
    await copyConsole(fakeTerm(["a", "b"]), null);
    expect(written).toBe("a\nb");
  });

  it("copies the full buffer when a filter exists but is inactive", async () => {
    const filter = { isActive: () => false, getFilteredText: () => "SHOULD NOT USE" };
    await copyConsole(fakeTerm(["a", "b"]), filter);
    expect(written).toBe("a\nb");
  });
});

describe("saveConsole respects an active filter", () => {
  it("saves ONLY the filtered text when the filter is active", async () => {
    const filter = { isActive: () => true, getFilteredText: () => "only this" };
    await saveConsole(fakeTerm(["x", "y", "only this"]), filter);
    expect(saveTextFile).toHaveBeenCalledTimes(1);
    expect(saveTextFile.mock.calls[0][1]).toBe("only this");
  });

  it("saves the full buffer with no filter", async () => {
    await saveConsole(fakeTerm(["x", "y"]), null);
    expect(saveTextFile.mock.calls[0][1]).toBe("x\ny");
  });
});
