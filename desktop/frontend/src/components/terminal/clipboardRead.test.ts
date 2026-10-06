import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readClipboardContent, readPasteContent, unlessNativePaste } from "./clipboardRead";

function item(parts: Record<string, Blob>): ClipboardItem {
  return {
    types: Object.keys(parts),
    getType: (type: string) => Promise.resolve(parts[type]),
  } as unknown as ClipboardItem;
}

const none = () => Promise.resolve("");

describe("readClipboardContent", () => {
  it("prefers an image over text", async () => {
    const png = new Blob(["x"], { type: "image/png" });
    const read = () => Promise.resolve([item({ "text/plain": new Blob(["a"]) }), item({ "image/png": png })]);
    expect(await readClipboardContent(none, { read })).toEqual({ kind: "image", blob: png, mimeType: "image/png" });
  });

  it("returns the text when there is no image", async () => {
    const read = () => Promise.resolve([item({ "text/plain": new Blob(["hello"]) })]);
    expect(await readClipboardContent(none, { read })).toEqual({ kind: "text", text: "hello" });
  });

  it("falls back to readText, then to the backend, when reads are refused", async () => {
    const read = () => Promise.reject(new Error("denied"));
    expect(await readClipboardContent(none, { read, readText: () => Promise.resolve("t") })).toEqual({
      kind: "text",
      text: "t",
    });
    const backend = vi.fn(() => Promise.resolve("from backend"));
    expect(
      await readClipboardContent(backend, { read, readText: () => Promise.reject(new Error("denied")) }),
    ).toEqual({ kind: "text", text: "from backend" });
    expect(await readClipboardContent(() => Promise.reject(new Error("no clipboard")), {})).toBeNull();
  });
});

describe("readPasteContent", () => {
  const refused = { read: () => Promise.reject(new Error("denied")), readText: () => Promise.reject(new Error("denied")) };

  it("prefers copied files, as their paths", async () => {
    const files = () => Promise.resolve(["/tmp/a.png", "/tmp/b.txt"]);
    expect(await readPasteContent(files, () => Promise.resolve("text"), refused)).toEqual({
      kind: "files",
      paths: ["/tmp/a.png", "/tmp/b.txt"],
    });
  });

  it("hands over the backend text whole when the webview refuses", async () => {
    const big = "x".repeat(64 * 1024);
    const readText = vi.fn(() => Promise.resolve(big));
    const clip = await readPasteContent(() => Promise.resolve([]), readText, refused);
    expect(clip).toEqual({ kind: "text", text: big });
    expect(readText).toHaveBeenCalledTimes(1);
  });

  it("starts the clipboard read before the files read settles", async () => {
    const order: string[] = [];
    const read = () => {
      order.push("clipboard");
      return Promise.reject(new Error("denied"));
    };
    const files = () => {
      order.push("files");
      return Promise.reject(new Error("no files"));
    };
    expect(await readPasteContent(files, () => Promise.resolve(42), { read })).toBeNull();
    expect(order).toEqual(["clipboard", "files"]);
  });
});

describe("unlessNativePaste", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("runs the fallback when no paste event follows the keypress", () => {
    const target = new EventTarget();
    const fallback = vi.fn();
    unlessNativePaste(target, fallback);
    expect(fallback).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it("stands down when the webview pasted natively", () => {
    const target = new EventTarget();
    const fallback = vi.fn();
    unlessNativePaste(target, fallback);
    target.dispatchEvent(new Event("paste"));
    vi.runAllTimers();
    expect(fallback).not.toHaveBeenCalled();
  });

  it("stops listening once the keypress is over", () => {
    const target = new EventTarget();
    const remove = vi.spyOn(target, "removeEventListener");
    unlessNativePaste(target, vi.fn());
    vi.runAllTimers();
    expect(remove).toHaveBeenCalledWith("paste", expect.any(Function), { capture: true });
  });
});
