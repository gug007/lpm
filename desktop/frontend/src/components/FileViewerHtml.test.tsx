// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../bridge/commands", () => ({
  HtmlPreviewRoot: vi.fn((path: string) => Promise.resolve(path.startsWith("/ssh/") ? null : "tok")),
}));

import { HtmlPreviewRoot } from "../../bridge/commands";
import { FileViewerHtml } from "./FileViewerHtml";
import { isHtmlPath, previewSrc } from "./htmlPreview";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

async function render(absPath: string, text = "<h1>hi</h1>") {
  await act(async () => root.render(<FileViewerHtml absPath={absPath} text={text} />));
  await act(async () => {});
}

const frame = () => container.querySelector("iframe");

describe("FileViewerHtml", () => {
  it("loads a page on this machine from its folder, so what it links loads too", async () => {
    await render("/proj/site/My Page.html");
    expect(frame()?.getAttribute("src")).toBe("lpm-preview://localhost/tok/My%20Page.html");
    expect(frame()?.getAttribute("sandbox")).toBe("allow-scripts allow-same-origin allow-forms");
  });

  it("renders a page held elsewhere from its text, in an origin of its own", async () => {
    await render("/ssh/proj/index.html", "<p>remote</p>");
    expect(frame()?.getAttribute("srcdoc")).toBe("<p>remote</p>");
    expect(frame()?.getAttribute("sandbox")).toBe("allow-scripts allow-forms");
  });

  it("doesn't ask this machine for a paired computer's page", async () => {
    await render("/@peer-0123abcd/Users/me/index.html", "<p>peer</p>");
    expect(HtmlPreviewRoot).not.toHaveBeenCalled();
    expect(frame()?.getAttribute("srcdoc")).toBe("<p>peer</p>");
  });

  it("reloads the page when the file changes", async () => {
    await render("/proj/index.html", "<p>one</p>");
    const first = frame();
    await render("/proj/index.html", "<p>one</p>");
    expect(frame()).toBe(first);
    await render("/proj/index.html", "<p>two</p>");
    expect(frame()).not.toBe(first);
  });
});

describe("htmlPreview", () => {
  it("knows an HTML file by its extension", () => {
    expect(isHtmlPath("/a/index.html")).toBe(true);
    expect(isHtmlPath("/a/OLD.HTM")).toBe(true);
    expect(isHtmlPath("/a/page.xhtml.md")).toBe(false);
  });

  it("routes the scheme the way WebView2 serves it on Windows", () => {
    expect(previewSrc("tok", "a.html", true)).toBe("http://lpm-preview.localhost/tok/a.html");
  });
});
