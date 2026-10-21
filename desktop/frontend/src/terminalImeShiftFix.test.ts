// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Terminal } from "@xterm/xterm";
import { installImeShiftFix } from "./terminalImeShiftFix";

// Event orders below are the ones WKWebView produced with the WeChat IME.

let term: Terminal;
let host: HTMLElement;
let sent: string[];
let dispose: () => void;

function ta(): HTMLTextAreaElement {
  return term.textarea!;
}

function key(type: "keydown" | "keyup", k: string, keyCode: number, shift = true) {
  ta().dispatchEvent(new KeyboardEvent(type, { key: k, keyCode, shiftKey: shift, bubbles: true, cancelable: true }));
}

function imeInsert(data: string) {
  ta().value += data;
  ta().dispatchEvent(new InputEvent("input", { inputType: "insertText", data, bubbles: true, composed: true }));
}

async function settle() {
  await new Promise((r) => setTimeout(r, 10));
}

// happy-dom has no canvas; xterm's DOM renderer only measures glyph widths.
const fakeContext = () =>
  new Proxy(
    { measureText: () => ({ width: 7 }) },
    { get: (t, p) => (p in t ? t[p as keyof typeof t] : () => {}) },
  );
HTMLCanvasElement.prototype.getContext = fakeContext as unknown as typeof HTMLCanvasElement.prototype.getContext;
if (typeof OffscreenCanvas !== "undefined") {
  OffscreenCanvas.prototype.getContext = fakeContext as unknown as typeof OffscreenCanvas.prototype.getContext;
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  term = new Terminal();
  term.open(host);
  sent = [];
  term.onData((d) => sent.push(d));
  dispose = installImeShiftFix(term);
});

afterEach(() => {
  dispose();
  term.dispose();
  host.remove();
});

describe("installImeShiftFix", () => {
  it("forwards the punctuation an IME commits right after a Shift keydown", async () => {
    key("keydown", "Shift", 16);
    imeInsert("？");
    key("keydown", "？", 229);
    await settle();
    key("keyup", "？", 191);
    key("keyup", "Shift", 16, false);
    await settle();
    expect(sent.join("")).toBe("？");
  });

  it("sends each press once while Shift stays held", async () => {
    key("keydown", "Shift", 16);
    for (let i = 0; i < 3; i++) {
      imeInsert("!");
      key("keydown", "!", 229);
      await settle();
      key("keyup", "!", 49);
    }
    key("keyup", "Shift", 16, false);
    await settle();
    expect(sent.join("")).toBe("!!!");
  });

  it("leaves input after a non-modifier keydown to xterm", async () => {
    key("keydown", "？", 229, false);
    imeInsert("？");
    await settle();
    key("keyup", "？", 191, false);
    await settle();
    expect(sent.join("")).toBe("？");
  });

  it("does not resend a committed pinyin composition", async () => {
    ta().dispatchEvent(new CompositionEvent("compositionstart", { data: "" }));
    key("keydown", "n", 229, false);
    ta().dispatchEvent(new CompositionEvent("compositionupdate", { data: "ni" }));
    key("keyup", "n", 78, false);
    key("keydown", " ", 229, false);
    ta().value = "你";
    ta().dispatchEvent(new CompositionEvent("compositionend", { data: "你" }));
    ta().dispatchEvent(new InputEvent("input", { inputType: "insertText", data: "你", isComposing: true, bubbles: true, composed: true }));
    await settle();
    key("keyup", " ", 32, false);
    await settle();
    expect(sent.join("")).toBe("你");
  });

  it("stops forwarding once disposed", async () => {
    dispose();
    dispose = () => {};
    key("keydown", "Shift", 16);
    imeInsert("？");
    key("keydown", "？", 229);
    await settle();
    expect(sent.join("")).toBe("");
  });
});
