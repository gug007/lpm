// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  store: {
    pickAddProjectKind: vi.fn(),
    addProjectTarget: null as { slug: string; alias: string } | null,
  },
  clipboard: vi.fn(),
}));

vi.mock("../store/app", () => ({
  useAppStore: (select: (state: unknown) => unknown) => select(mocks.store),
}));
vi.mock("../store/settings", () => ({
  getSettings: () => ({ defaultProjectDirectory: "/Users/ana/Projects" }),
}));
vi.mock("../../bridge/commands", () => ({ ReadClipboardText: mocks.clipboard }));

import { ClipboardCloneCard } from "./ClipboardCloneCard";
import { useCloneOffer } from "../clone/cloneOffer";

let container: HTMLDivElement;
let root: Root;

async function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<ClipboardCloneCard />));
}

function button(text: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);
  if (!found) throw new Error(`no button "${text}"`);
  return found;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  useCloneOffer.setState({ dismissed: [], prefillUrl: null });
  mocks.store.addProjectTarget = null;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

describe("ClipboardCloneCard", () => {
  it("offers the repo on the clipboard and opens the clone dialog with it", async () => {
    mocks.clipboard.mockResolvedValue("git@github.com:acme/storefront.git\n");
    await mount();
    expect(container.textContent).toContain("Clone github.com/acme/storefront?");
    expect(container.textContent).toContain("From your clipboard · into ~/Projects");
    act(() => button("Clone…").click());
    expect(useCloneOffer.getState().prefillUrl).toBe("git@github.com:acme/storefront.git");
    expect(mocks.store.pickAddProjectKind).toHaveBeenCalledWith("clone");
  });

  it("stays away for a URL waved off with Not now", async () => {
    mocks.clipboard.mockResolvedValue("https://github.com/acme/storefront");
    await mount();
    act(() => button("Not now").click());
    expect(container.textContent).toBe("");
    expect(JSON.parse(localStorage.getItem("lpm-clone-offer-dismissed") ?? "[]")).toEqual([
      "https://github.com/acme/storefront",
    ]);
  });

  it("shows nothing for text that isn't a Git remote", async () => {
    mocks.clipboard.mockResolvedValue("https://example.com/blog/post");
    await mount();
    expect(container.textContent).toBe("");
  });

  it("reads the clipboard again when the window comes back", async () => {
    mocks.clipboard.mockResolvedValue("");
    await mount();
    expect(container.textContent).toBe("");
    mocks.clipboard.mockResolvedValue("https://gitlab.com/group/app.git");
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(container.textContent).toContain("Clone gitlab.com/group/app?");
  });

  it("names the paired computer it would clone onto", async () => {
    mocks.store.addProjectTarget = { slug: "aaaa1111", alias: "Office PC" };
    mocks.clipboard.mockResolvedValue("https://github.com/acme/storefront");
    await mount();
    expect(container.textContent).toContain("From your clipboard · on Office PC");
  });
});
