// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentZoom } from "../../hooks/useContentZoom";
import { FilesMarkdownPreview } from "./FilesMarkdownPreview";

const mocks = vi.hoisted(() => ({
  openUrl: vi.fn(),
  readFile: vi.fn(() => Promise.resolve({ mimeType: "image/png", data: "AAAA" })),
}));

vi.mock("../../../bridge/runtime", () => ({ BrowserOpenURL: mocks.openUrl }));
vi.mock("../../../bridge/commands", () => ({ NotesReadFileAsInput: mocks.readFile }));
vi.mock("../../highlight", () => ({
  ensureLang: () => Promise.resolve(false),
  tokenizeLines: () => Promise.resolve([]),
}));

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

function zoomAt(zoom: number): ContentZoom {
  return {
    zoom,
    percent: Math.round(zoom * 100),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    zoomReset: vi.fn(),
    canZoomIn: true,
    canZoomOut: true,
    surfaceRef: vi.fn(),
  };
}

function render(text: string, zoom = 1) {
  const onOpenFile = vi.fn();
  act(() => {
    root.render(
      <FilesMarkdownPreview
        text={text}
        path="docs/guide.md"
        zoom={zoomAt(zoom)}
        projectRoot="/proj"
        onOpenFile={onOpenFile}
      />,
    );
  });
  return onOpenFile;
}

describe("FilesMarkdownPreview", () => {
  it("renders the document's structure", () => {
    render("# Title\n\n- one\n- two\n\n`code`");
    expect(container.querySelector("h1")?.textContent).toBe("Title");
    expect(container.querySelectorAll("li")).toHaveLength(2);
    expect(container.querySelector("code")?.textContent).toBe("code");
  });

  it("lets a paragraph reflow instead of keeping the source's line breaks", () => {
    render("first line\nsecond line");
    expect(container.querySelector("p")?.className).not.toContain("whitespace-pre-wrap");
  });

  it("opens a relative link as a project file and an absolute one outside", () => {
    const onOpenFile = render("[readme](../README.md) [site](https://lpm.cx)");
    const [relative, external] = Array.from(container.querySelectorAll("a"));
    act(() => relative.click());
    expect(onOpenFile).toHaveBeenCalledWith("README.md");
    expect(mocks.openUrl).not.toHaveBeenCalled();
    act(() => external.click());
    expect(mocks.openUrl).toHaveBeenCalledWith("https://lpm.cx");
    expect(onOpenFile).toHaveBeenCalledTimes(1);
  });

  it("reads a relative image from disk beside the file", async () => {
    render("![shot](img/a.png)");
    expect(mocks.readFile).toHaveBeenCalledWith("/proj/docs/img/a.png", expect.any(Number));
    await act(async () => {});
    expect(container.querySelector("img")?.getAttribute("src")).toBe("data:image/png;base64,AAAA");
  });

  it("scales the page by the reader zoom", () => {
    render("text", 1.5);
    const page = container.querySelector<HTMLElement>("[data-files-preview] > div");
    expect(page?.style.zoom).toBe("1.5");
  });

  it("renders GitHub's inline HTML: centred blocks, sized images, breaks", async () => {
    render(
      '<p align="center"><strong>Add a project</strong><br><img src="img/a.gif" width="700"></p>',
    );
    const p = container.querySelector<HTMLElement>("p");
    expect(p?.style.textAlign).toBe("center");
    expect(p?.querySelector("strong")?.textContent).toBe("Add a project");
    expect(p?.querySelector("br")).not.toBeNull();
    expect(mocks.readFile).toHaveBeenCalledWith("/proj/docs/img/a.gif", expect.any(Number));
    await act(async () => {});
    expect(container.querySelector("img")?.getAttribute("width")).toBe("700");
  });

  it("strips scripts and event handlers from inline HTML", () => {
    render('<script>window.x = 1</script><a href="https://a.b" onclick="x()">a</a>');
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("a")?.getAttribute("onclick")).toBeNull();
  });

  it("leaves a remote image to the browser", () => {
    render("![logo](https://lpm.cx/logo.png)");
    expect(mocks.readFile).not.toHaveBeenCalled();
    expect(container.querySelector("img")?.getAttribute("src")).toBe("https://lpm.cx/logo.png");
  });
});
