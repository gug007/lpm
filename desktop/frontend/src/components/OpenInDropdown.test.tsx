// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));
vi.mock("../../bridge/commands", () => ({
  ListOpenInTargets: vi.fn(() =>
    Promise.resolve([
      { id: "cursor", label: "Cursor", icon: "data:,", remoteCapable: true },
      { id: "zed", label: "Zed", icon: "data:," },
      { id: "terminal", label: "Terminal", icon: "data:," },
    ]),
  ),
  OpenIn: vi.fn(() => Promise.resolve()),
}));

import * as commands from "../../bridge/commands";
import { OpenInDropdown } from "./OpenInDropdown";

const HOST_PROJECT = "/@peer-abcd1234/srv/app";

let container: HTMLDivElement;
let root: Root;

async function show(projectPath: string, { isRemote = false, peerViaSsh = false } = {}) {
  await act(async () =>
    root.render(<OpenInDropdown projectPath={projectPath} isRemote={isRemote} peerViaSsh={peerViaSsh} />),
  );
  for (let i = 0; i < 4; i++) await act(async () => {});
}

function button(title: string): HTMLButtonElement | null {
  return container.querySelector<HTMLButtonElement>(`button[title="${title}"]`);
}

async function click(el: HTMLElement | null) {
  await act(async () => el?.click());
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

describe("OpenInDropdown for a project on a paired machine", () => {
  it("offers the editors that reach it over SSH", async () => {
    await show(HOST_PROJECT, { peerViaSsh: true });
    await click(button("Choose app"));
    expect(menuLabels()).toEqual(["Cursor"]);
    await click(button("Open in Cursor"));
    expect(commands.OpenIn).toHaveBeenCalledWith("cursor", HOST_PROJECT);
  });

  it("offers nothing when this Mac doesn't reach the machine over SSH", async () => {
    await show(HOST_PROJECT);
    expect(button("Choose app")).toBeNull();
  });

  it("offers nothing for an SSH project that machine runs on a third one", async () => {
    await show(HOST_PROJECT, { isRemote: true, peerViaSsh: true });
    expect(button("Choose app")).toBeNull();
  });
});

describe("OpenInDropdown for a project on this Mac", () => {
  it("keeps every app", async () => {
    await show("/Users/me/app");
    await click(button("Choose app"));
    expect(menuLabels()).toEqual(["Cursor", "Zed", "Terminal"]);
    await click(button("Open in Cursor"));
    expect(commands.OpenIn).toHaveBeenCalledWith("cursor", "/Users/me/app");
  });
});
