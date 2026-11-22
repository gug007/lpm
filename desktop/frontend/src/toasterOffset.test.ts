// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { toastFloor } from "./toasterOffset";

const VIEWPORT = { width: 1440, height: 900 };

function floor(top: number, left: number, right: number, height = 40): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("data-toast-floor", "");
  el.getBoundingClientRect = () =>
    ({ top, left, right, bottom: top + height, width: right - left, height }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("toastFloor", () => {
  it("sits just above the footer row", () => {
    floor(856, 260, 1440, 44);
    expect(toastFloor(12, document, VIEWPORT)).toBe(44 + 12);
  });

  it("clears a composer under the toast column", () => {
    floor(856, 260, 1440, 44);
    floor(780, 260, 1440, 76);
    expect(toastFloor(12, document, VIEWPORT)).toBe(120 + 12);
  });

  it("ignores a composer in a pane left of the toast column", () => {
    floor(856, 260, 1440, 44);
    floor(700, 260, 700, 156);
    expect(toastFloor(12, document, VIEWPORT)).toBe(44 + 12);
  });

  it("clears the mini views in the corner", () => {
    floor(856, 260, 1440, 44);
    floor(780, 260, 1440, 76);
    floor(520, 1104, 1424, 232);
    expect(toastFloor(12, document, VIEWPORT)).toBe(900 - 520 + 12);
  });

  it("keeps a toast on screen when the floor reaches the window top", () => {
    floor(856, 260, 1440, 44);
    floor(40, 1104, 1424, 668);
    expect(toastFloor(12, document, VIEWPORT)).toBe(900 - 160);
  });

  it("skips hidden elements and falls back to the window edge", () => {
    floor(0, 0, 0, 0);
    expect(toastFloor(12, document, VIEWPORT)).toBe(12);
  });
});
