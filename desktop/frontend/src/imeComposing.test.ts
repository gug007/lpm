// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { isImeComposing } from "./imeComposing";

const key = (init: KeyboardEventInit & { keyCode?: number }) => {
  const e = new KeyboardEvent("keydown", init);
  if (init.keyCode !== undefined) Object.defineProperty(e, "keyCode", { value: init.keyCode });
  return e;
};

describe("isImeComposing", () => {
  it("treats a plain Enter as not composing", () => {
    expect(isImeComposing(key({ key: "Enter", keyCode: 13 }))).toBe(false);
  });

  it("honours isComposing", () => {
    expect(isImeComposing(key({ key: "Enter", isComposing: true }))).toBe(true);
  });

  it("catches WebKit's candidate-commit Enter (isComposing already false, keyCode 229)", () => {
    expect(isImeComposing(key({ key: "Enter", isComposing: false, keyCode: 229 }))).toBe(true);
  });

  it("unwraps React synthetic events", () => {
    const nativeEvent = key({ key: "Enter", keyCode: 229 });
    expect(isImeComposing({ nativeEvent } as never)).toBe(true);
  });
});
