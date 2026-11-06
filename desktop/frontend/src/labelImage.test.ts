// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { labelImage } from "./labelImage";
import type { PopupTheme } from "./popup/popupTypes";

const theme: PopupTheme = { mode: "dark", colors: { text: "rgb(229, 229, 229)", accent: "rgb(110, 168, 254)" } };

function svgOf(src: string | null): string {
  expect(src).not.toBeNull();
  return decodeURIComponent(src!.replace("data:image/svg+xml;charset=utf-8,", ""));
}

describe("labelImage", () => {
  it("draws an svg as written, with lpm's colors to read", () => {
    const svg = svgOf(labelImage('<svg width="76" height="30"><text x="4" y="20">149</text></svg>', theme));
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain("--lpm-accent:rgb(110, 168, 254)");
    expect(svg).toContain(">149</text>");
  });

  it("takes out anything that could run or reach out", () => {
    const svg = svgOf(
      labelImage(
        '<svg xmlns="http://www.w3.org/2000/svg" onload="x()"><script>alert(1)</script><image href="https://example.com/t.png"></image><rect style="fill:url(https://example.com/a)"></rect></svg>',
        theme,
      ),
    );
    expect(svg).not.toContain("script");
    expect(svg).not.toContain("onload");
    expect(svg).not.toContain("example.com");
  });

  it("falls back to the text label for markup it can't draw", () => {
    expect(labelImage("", theme)).toBeNull();
    expect(labelImage(`<svg>${"x".repeat(40 * 1024)}</svg>`, theme)).toBeNull();
    expect(labelImage("<svg><g></svg>", theme)).toBeNull();
    expect(labelImage("<div>149</div>", theme)).toBeNull();
  });
});
