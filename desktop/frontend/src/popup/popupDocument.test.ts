import { describe, expect, it } from "vitest";
import { injectHead, popupDocument, scriptJson } from "./popupDocument";
import type { PopupPayload } from "./popupTypes";

const payload: PopupPayload = {
  data: { total: 3, note: "</script><script>alert(1)</script>" },
  text: "",
  error: "",
  theme: {
    mode: "dark",
    colors: {
      bg: "rgb(38, 38, 38)",
      surface: "rgb(23, 23, 23)",
      text: "rgb(237, 237, 237)",
      muted: "rgb(150, 150, 150)",
      border: "rgb(60, 60, 60)",
      accent: "rgb(110, 168, 254)",
      green: "rgb(80, 200, 120)",
      red: "rgb(240, 90, 90)",
      amber: "rgb(240, 180, 60)",
    },
  },
  project: "web",
  action: "stars",
};

describe("popupDocument", () => {
  it("puts the bootstrap first in the page's own head", () => {
    const doc = popupDocument("<!doctype html><html><head><title>x</title></head><body></body></html>", payload);
    expect(doc.indexOf("<script>")).toBeLessThan(doc.indexOf("<title>"));
    expect(doc.startsWith("<!doctype html><html><head>")).toBe(true);
  });

  it("starts where a head would on a page without one", () => {
    expect(injectHead("<html><body>hi</body></html>", "<x>")).toBe("<html><x><body>hi</body></html>");
    expect(injectHead("<!DOCTYPE html><p>hi</p>", "<x>")).toBe("<!DOCTYPE html><x><p>hi</p>");
    expect(injectHead("<p>hi</p>", "<x>")).toBe("<x><p>hi</p>");
  });

  it("keeps data that looks like markup inside the script", () => {
    const doc = popupDocument("<p></p>", payload);
    expect(doc).not.toContain("</script><script>alert(1)");
    expect(scriptJson("a</b>\u2028")).toBe('"a\\u003c/b>\\u2028"');
  });

  it("points a page with files beside it at their folder", () => {
    const doc = popupDocument("<head></head>", payload, 'lpm-preview://localhost/tok/"x/');
    expect(doc).toContain('<base href="lpm-preview://localhost/tok/&quot;x/">');
  });

  it("gives the page lpm's colors as a default it can override", () => {
    const doc = popupDocument("<p></p>", payload);
    expect(doc).toContain(":where(html){background:rgb(38, 38, 38);color:rgb(237, 237, 237)");
  });

  it("hands the page window.lpm with the first data and later pushes", () => {
    const doc = popupDocument("<p></p>", payload);
    const script = /<script>([\s\S]*)<\/script>/.exec(doc)?.[1] ?? "";
    const seen: unknown[] = [];
    const win: Record<string, unknown> = { addEventListener: () => {}, console };
    win.parent = win;
    const doc0 = { documentElement: { style: { setProperty: () => {} } }, addEventListener: () => {} };
    new Function("window", "document", script)(win, doc0);
    const lpm = win.lpm as { data: unknown; onData: (fn: (d: unknown) => void) => void };
    expect(lpm.data).toEqual(payload.data);
    lpm.onData((d) => seen.push(d));
    (win.__lpmPush as (p: unknown) => void)({ data: { total: 4 } });
    expect(seen).toEqual([{ total: 4 }]);
  });
});
