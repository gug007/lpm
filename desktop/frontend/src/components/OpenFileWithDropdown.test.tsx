// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  toast: Object.assign(vi.fn(), { error: vi.fn() }),
  download: vi.fn((_token: string, _slug: string, _name: string, p: Promise<unknown>) => p),
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("../peer/uploadProgress", () => ({ trackPeerDownload: mocks.download }));
vi.mock("../../bridge/commands", () => ({
  ListOpenInTargets: vi.fn(() =>
    Promise.resolve([
      { id: "cursor", label: "Cursor", icon: "data:," },
      { id: "terminal", label: "Terminal", icon: "data:," },
      { id: "finder", label: "Finder", icon: "data:," },
    ]),
  ),
  OpenFileInEditor: vi.fn(() => Promise.resolve({ copy: true, host: "build box" })),
  OpenPathInDefaultApp: vi.fn(() => Promise.resolve({ copy: true, host: "build box" })),
}));

import * as commands from "../../bridge/commands";
import { OpenFileWithDropdown } from "./OpenFileWithDropdown";

const HOST_PDF = "/@peer-abcd1234/srv/app/receipt.pdf";
const HOST_CODE = "/@peer-abcd1234/srv/app/main.ts";

let container: HTMLDivElement;
let root: Root;

async function show(absPath: string, line = 0, col = 0) {
  await act(async () => root.render(<OpenFileWithDropdown absPath={absPath} line={line} col={col} />));
  for (let i = 0; i < 3; i++) await act(async () => {});
}

function button(title: string): HTMLButtonElement {
  const el = container.querySelector<HTMLButtonElement>(`button[title="${title}"]`);
  if (!el) throw new Error(`no button titled ${title}`);
  return el;
}

async function click(el: HTMLElement) {
  await act(async () => el.click());
  for (let i = 0; i < 3; i++) await act(async () => {});
}

function menuLabels(): string[] {
  return [...container.querySelectorAll(".absolute button")].map((b) => b.textContent ?? "");
}

beforeEach(() => {
  localStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

describe("OpenFileWithDropdown on a paired machine's file", () => {
  it("says whether it's a file to edit, so a picture or PDF never waits on Remote-SSH", async () => {
    await show(HOST_PDF);
    await click(button("Open in Cursor"));
    expect(commands.OpenFileInEditor).toHaveBeenCalledWith("cursor", HOST_PDF, 0, 0, false);
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(mocks.toast.error).not.toHaveBeenCalled();
  });

  it("shows the copy's progress while it comes over", async () => {
    await show(HOST_PDF);
    await click(button("Open in Cursor"));
    expect(mocks.download).toHaveBeenCalledWith(HOST_PDF, "abcd1234", "receipt.pdf", expect.any(Promise));
  });

  it("offers only apps that open a file", async () => {
    await show(HOST_PDF);
    await click(button("Choose app"));
    expect(menuLabels()).toEqual(["Cursor", "Default app"]);
  });

  it("opens it in its default app", async () => {
    localStorage.setItem("lpm.openFileWith.selectedId", "__default_app__");
    await show(HOST_PDF);
    await click(button("Open in Default app"));
    expect(commands.OpenPathInDefaultApp).toHaveBeenCalledWith(HOST_PDF);
  });

  it("says when a file to edit came as a read-only copy", async () => {
    await show(HOST_CODE, 12, 3);
    await click(button("Open in Cursor"));
    expect(commands.OpenFileInEditor).toHaveBeenCalledWith("cursor", HOST_CODE, 12, 3, true);
    expect(mocks.toast).toHaveBeenCalledWith("main.ts opened read-only", {
      description: "This is a copy. The file itself is on build box.",
    });
  });

  it("treats an SVG as source to edit, not a picture", async () => {
    await show("/@peer-abcd1234/srv/app/logo.svg");
    await click(button("Open in Cursor"));
    expect(commands.OpenFileInEditor).toHaveBeenCalledWith("cursor", "/@peer-abcd1234/srv/app/logo.svg", 0, 0, true);
  });

  it("stays quiet when the editor reached the host's own file", async () => {
    vi.mocked(commands.OpenFileInEditor).mockResolvedValueOnce({ copy: false, host: "build box" });
    await show(HOST_CODE);
    await click(button("Open in Cursor"));
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it("shows why it couldn't open", async () => {
    vi.mocked(commands.OpenFileInEditor).mockRejectedValueOnce("can't reach build box");
    await show(HOST_PDF);
    await click(button("Open in Cursor"));
    expect(mocks.toast.error).toHaveBeenCalledWith("Open in Cursor: can't reach build box");
  });
});

describe("OpenFileWithDropdown on this Mac's file", () => {
  it("keeps every app", async () => {
    vi.mocked(commands.OpenFileInEditor).mockResolvedValueOnce(null);
    await show("/Users/me/notes.md", 4, 2);
    await click(button("Choose app"));
    expect(menuLabels()).toEqual(["Cursor", "Terminal", "Finder", "Default app"]);
    await click(button("Open in Cursor"));
    expect(commands.OpenFileInEditor).toHaveBeenCalledWith("cursor", "/Users/me/notes.md", 4, 2, true);
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled();
  });
});
