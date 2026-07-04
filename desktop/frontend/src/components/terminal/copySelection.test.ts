import { describe, it, expect, vi, beforeEach } from "vitest";

import { handleCopyShortcut, handleNativeCopy } from "./copySelection";

interface FakeRow {
  text: string;
  wrapped?: boolean;
}

function fakeTerm(
  rows: FakeRow[],
  sel?: { startX?: number; endX?: number },
) {
  const startX = sel?.startX ?? 0;
  const endX = rows.length ? (sel?.endX ?? rows[rows.length - 1].text.length) : 0;
  return {
    getSelection: () => rows.map((r) => r.text).join("\n"),
    getSelectionPosition: () =>
      rows.length
        ? {
            start: { x: startX, y: 0 },
            end: { x: endX, y: rows.length - 1 },
          }
        : undefined,
    buffer: {
      active: {
        getLine: (y: number) => ({
          isWrapped: !!rows[y].wrapped,
          translateToString: (_trim: boolean, sx: number, ex?: number) =>
            rows[y].text.slice(sx, ex),
        }),
      },
    },
  } as never;
}

function keyEvent(over: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return {
    type: "keydown",
    key: "c",
    metaKey: true,
    ctrlKey: false,
    altKey: false,
    preventDefault: vi.fn(),
    ...over,
  } as unknown as KeyboardEvent;
}

function copyEvent() {
  const data = new Map<string, string>();
  const event = {
    clipboardData: {
      setData: (type: string, value: string) => data.set(type, value),
    },
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as ClipboardEvent;
  return { event, data };
}

let written: string | null;

beforeEach(() => {
  written = null;
  vi.stubGlobal("navigator", {
    clipboard: {
      writeText: vi.fn(async (t: string) => {
        written = t;
      }),
    },
  });
});

describe("handleCopyShortcut", () => {
  it("copies the cleaned selection on ⌘C keydown", async () => {
    const e = keyEvent();
    const handled = handleCopyShortcut(e, fakeTerm([{ text: "  foo" }, { text: "  bar" }]), null);
    await Promise.resolve();
    expect(handled).toBe(true);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(written).toBe("foo\nbar");
  });

  it("still matches when Caps Lock uppercases the key", async () => {
    const e = keyEvent({ key: "C" });
    const handled = handleCopyShortcut(e, fakeTerm([{ text: "foo" }]), null);
    await Promise.resolve();
    expect(handled).toBe(true);
    expect(written).toBe("foo");
  });

  it("matches the physical C key on non-Latin layouts", async () => {
    const e = keyEvent({ key: "с", code: "KeyC" });
    const handled = handleCopyShortcut(e, fakeTerm([{ text: "foo" }]), null);
    await Promise.resolve();
    expect(handled).toBe(true);
    expect(written).toBe("foo");
  });

  it("does not match the physical C key when the layout puts another Latin letter there", () => {
    const e = keyEvent({ key: "j", code: "KeyC" });
    expect(handleCopyShortcut(e, fakeTerm([{ text: "foo" }]), null)).toBe(false);
    expect(written).toBeNull();
  });

  it("leaves ⌘C alone when nothing is selected, so the app can receive it", () => {
    const e = keyEvent();
    expect(handleCopyShortcut(e, fakeTerm([]), null)).toBe(false);
    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(written).toBeNull();
  });

  it("ignores Ctrl+C so it keeps interrupting the running program", () => {
    const e = keyEvent({ metaKey: false, ctrlKey: true });
    expect(handleCopyShortcut(e, fakeTerm([{ text: "foo" }]), null)).toBe(false);
    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(written).toBeNull();
  });

  it("ignores ⌘C on keyup", () => {
    const e = keyEvent({ type: "keyup" });
    expect(handleCopyShortcut(e, fakeTerm([{ text: "foo" }]), null)).toBe(false);
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it("ignores ⌘C with Ctrl or Alt held", () => {
    expect(handleCopyShortcut(keyEvent({ ctrlKey: true }), fakeTerm([{ text: "x" }]), null)).toBe(false);
    expect(handleCopyShortcut(keyEvent({ altKey: true }), fakeTerm([{ text: "x" }]), null)).toBe(false);
  });

  it("ignores ⌘⇧C so it stays inert like before", () => {
    const e = keyEvent({ key: "C", shiftKey: true });
    expect(handleCopyShortcut(e, fakeTerm([{ text: "x" }]), null)).toBe(false);
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it("leaves a whitespace-only selection alone instead of blanking the clipboard", () => {
    const e = keyEvent();
    expect(handleCopyShortcut(e, fakeTerm([{ text: "   " }, { text: "\t " }]), null)).toBe(false);
    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(written).toBeNull();
  });

  it("respects partial-row selection bounds", async () => {
    const e = keyEvent();
    const term = fakeTerm(
      [{ text: "hello world" }, { text: "second line" }],
      { startX: 6, endX: 6 },
    );
    handleCopyShortcut(e, term, null);
    await Promise.resolve();
    expect(written).toBe("world\nsecond");
  });
});

describe("handleNativeCopy", () => {
  it("writes the cleaned selection into the clipboard event", () => {
    const { event, data } = copyEvent();
    const handled = handleNativeCopy(event, fakeTerm([{ text: "  foo" }, { text: "  bar" }]), null);
    expect(handled).toBe(true);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(data.get("text/plain")).toBe("foo\nbar");
    expect(data.has("text/html")).toBe(false);
    expect(written).toBeNull();
  });

  it("writes text/html when a serializer is available", () => {
    const { event, data } = copyEvent();
    const serialize = { serializeAsHTML: () => "<pre>html</pre>" } as never;
    handleNativeCopy(event, fakeTerm([{ text: "foo" }]), serialize);
    expect(data.get("text/plain")).toBe("foo");
    expect(data.get("text/html")).toBe("<pre>html</pre>");
  });

  it("leaves the event alone when nothing is selected", () => {
    const { event, data } = copyEvent();
    expect(handleNativeCopy(event, fakeTerm([]), null)).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(data.size).toBe(0);
  });

  it("merges soft-wrapped rows back into one logical line", () => {
    const { event, data } = copyEvent();
    handleNativeCopy(event, fakeTerm([{ text: "aaa" }, { text: "bbb", wrapped: true }]), null);
    expect(data.get("text/plain")).toBe("aaabbb");
  });

  it("strips a shared agent gutter prefix", () => {
    const { event, data } = copyEvent();
    handleNativeCopy(event, fakeTerm([{ text: "▎ foo" }, { text: "▎ bar" }]), null);
    expect(data.get("text/plain")).toBe("foo\nbar");
  });

});

describe("cleaning semantics", () => {
  function copied(rows: Array<{ text: string; wrapped?: boolean }>): string | undefined {
    const { event, data } = copyEvent();
    handleNativeCopy(event, fakeTerm(rows), null);
    return data.get("text/plain");
  }

  it("strips the gutter at exactly the 4-in-5 ratio", () => {
    expect(
      copied([
        { text: "▎ a" },
        { text: "▎ b" },
        { text: "▎ c" },
        { text: "▎ d" },
        { text: "plain" },
      ]),
    ).toBe("a\nb\nc\nd\nplain");
  });

  it("keeps the gutter below the ratio", () => {
    expect(
      copied([{ text: "▎ a" }, { text: "▎ b" }, { text: "▎ c" }, { text: "x" }, { text: "y" }]),
    ).toBe("▎ a\n▎ b\n▎ c\nx\ny");
  });

  it("dedents a single indented line entirely", () => {
    expect(copied([{ text: "    return x;" }])).toBe("return x;");
  });

  it("collapses runs of blank lines down to one", () => {
    expect(copied([{ text: "a" }, { text: "" }, { text: "" }, { text: "b" }])).toBe("a\n\nb");
  });
});
