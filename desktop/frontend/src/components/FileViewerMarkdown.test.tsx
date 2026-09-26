// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentZoom } from "../hooks/useContentZoom";
import { prefixRoot } from "../peer/markers";
import { FileViewerMarkdown } from "./FileViewerMarkdown";

const mocks = vi.hoisted(() => ({
  readFile: vi.fn((_path: string) => Promise.resolve({ mimeType: "image/png", data: "AAAA" })),
  openFileViewer: vi.fn(),
}));

vi.mock("../../bridge/runtime", () => ({ BrowserOpenURL: vi.fn() }));
vi.mock("../../bridge/commands", () => ({ NotesReadFileAsInput: mocks.readFile }));
vi.mock("../store/fileViewer", () => ({ openFileViewer: mocks.openFileViewer }));
vi.mock("../highlight", () => ({
  ensureLang: () => Promise.resolve(false),
  tokenizeLines: () => Promise.resolve([]),
}));

const HOST = "0a1b2c3d";
const onHost = (path: string) => prefixRoot(HOST, path);

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

const zoom: ContentZoom = {
  zoom: 1,
  percent: 100,
  zoomIn: vi.fn(),
  zoomOut: vi.fn(),
  zoomReset: vi.fn(),
  canZoomIn: true,
  canZoomOut: true,
  surfaceRef: vi.fn(),
};

// Render `text` as the file at absPath and report where its image is read
// from and where its link opens.
function resolve(absPath: string, projectRoot: string, text: string) {
  act(() => {
    root.render(
      <FileViewerMarkdown text={text} absPath={absPath} projectRoot={projectRoot} zoom={zoom} />,
    );
  });
  container.querySelector("a")?.click();
  return {
    image: mocks.readFile.mock.calls.at(-1)?.[0],
    link: mocks.openFileViewer.mock.calls.at(-1)?.[0]?.absPath,
  };
}

// Each case: a file, the project it was opened from, and one image + one link.
const CASES: [name: string, absPath: string, projectRoot: string, text: string][] = [
  ["in-project relative", "/srv/app/docs/a.md", "/srv/app", "![i](img.png) [l](b.md)"],
  ["in-project root-relative", "/srv/app/docs/a.md", "/srv/app", "![i](/img.png) [l](/README.md)"],
  ["outside-project relative", "/etc/notes/a.md", "/srv/app", "![i](img.png) [l](../b.md)"],
  ["outside-project root-relative", "/etc/notes/a.md", "/srv/app", "![i](/var/img.png) [l](/var/b.md)"],
  ["outside-project above the root", "/etc/a.md", "/srv/app", "![i](../../img.png) [l](../../b.md)"],
  ["no project", "/etc/notes/a.md", "", "![i](img.png) [l](/var/b.md)"],
];

describe("FileViewerMarkdown on a paired host", () => {
  it.each(CASES)("%s: resolves images and links on the host, like a local file", (_, absPath, projectRoot, text) => {
    const local = resolve(absPath, projectRoot, text);
    const host = resolve(onHost(absPath), projectRoot && onHost(projectRoot), text);
    expect(local.image).toBeDefined();
    expect(local.link).toBeDefined();
    expect(host).toEqual({ image: onHost(local.image!), link: onHost(local.link!) });
  });

  it("keeps a home-relative host file on the host", () => {
    const host = resolve(onHost("~/notes/a.md"), onHost("/srv/app"), "![i](img.png) [l](/var/b.md)");
    expect(host).toEqual({ image: onHost("~/notes/img.png"), link: onHost("/var/b.md") });
  });
});
