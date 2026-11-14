// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  commands: {} as Record<string, ReturnType<typeof vi.fn>>,
  handlers: new Map<string, Set<(payload: unknown) => void>>(),
  finish: null as null | ((err?: Error) => void),
  closeAddCloneModal: vi.fn(),
  addCloneProject: vi.fn(),
}));

vi.mock("../store/app", async () => {
  const { create: makeStore } = await vi.importActual<typeof import("zustand")>("zustand");
  const useAppStore = makeStore(() => ({
    cloneModalOpen: true,
    addingCloneProject: false,
    addProjectTarget: null as { slug: string; alias: string } | null,
    closeAddCloneModal: mocks.closeAddCloneModal,
    addCloneProject: async (params: unknown) => {
      mocks.addCloneProject(params);
      useAppStore.setState({ addingCloneProject: true });
      try {
        await new Promise<void>((resolve, reject) => {
          mocks.finish = (err) => (err ? reject(err) : resolve());
        });
      } finally {
        useAppStore.setState({ addingCloneProject: false });
      }
    },
  }));
  return { useAppStore };
});
vi.mock("../store/settings", () => ({
  getSettings: () => ({ defaultProjectDirectory: "/Users/ana/Projects" }),
}));
vi.mock("../../bridge/commands", () =>
  new Proxy(
    {},
    {
      has: () => true,
      get: (_t, prop: string) =>
        prop === "then" ? undefined : (mocks.commands[prop] ??= vi.fn().mockResolvedValue(true)),
    },
  ),
);
vi.mock("../../bridge/runtime", () => ({
  EventsOn: (name: string, cb: (payload: unknown) => void) => {
    const set = mocks.handlers.get(name) ?? new Set();
    set.add(cb);
    mocks.handlers.set(name, set);
    return () => set.delete(cb);
  },
}));

import { AddCloneRepoModal } from "./AddCloneRepoModal";
import { useCloneOffer } from "../clone/cloneOffer";
import { useAppStore } from "../store/app";

let container: HTMLDivElement;
let root: Root;

function button(text: string): HTMLButtonElement {
  const found = [...document.body.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);
  if (!found) throw new Error(`no button "${text}"`);
  return found;
}

function input(placeholder: string): HTMLInputElement {
  return document.body.querySelector<HTMLInputElement>(`input[placeholder="${placeholder}"]`)!;
}

function emit(event: string, payload: unknown) {
  act(() => mocks.handlers.get(event)?.forEach((cb) => cb(payload)));
}

async function startClone(): Promise<string> {
  await act(async () => button("Clone repository").click());
  await act(async () => {});
  expect(mocks.addCloneProject).toHaveBeenCalledTimes(1);
  return (mocks.addCloneProject.mock.calls[0][0] as { cloneId: string }).cloneId;
}

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  useCloneOffer.setState({ dismissed: [], prefillUrl: "https://github.com/acme/storefront.git" });
  useAppStore.setState({ cloneModalOpen: true, addingCloneProject: false, addProjectTarget: null });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<AddCloneRepoModal />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  mocks.handlers.clear();
  mocks.finish = null;
  for (const k of Object.keys(mocks.commands)) delete mocks.commands[k];
  vi.clearAllMocks();
});

describe("AddCloneRepoModal", () => {
  it("opens filled in from the clipboard offer", () => {
    expect(input("https://github.com/owner/repo.git").value).toBe("https://github.com/acme/storefront.git");
    expect(input("my-repo").value).toBe("storefront");
    expect(input("Pick a parent folder…").value).toBe("/Users/ana/Projects");
  });

  it("shows git's progress while it clones", async () => {
    const id = await startClone();
    expect(document.body.textContent).toContain("Connecting to github.com…");
    emit("clone-progress", { id: "someone-else", phase: "checkout", percent: 5, done: 1, total: 20, size: null, speed: null, finished: false });
    emit("clone-progress", {
      id,
      phase: "receiving",
      percent: 62,
      done: 765,
      total: 1234,
      size: "812.00 MiB",
      speed: "18.00 MiB/s",
      finished: false,
    });
    const text = document.body.textContent ?? "";
    expect(text).toContain("Receiving objects");
    expect(text).toContain("812.00 MiB · 18.00 MiB/s");
    expect(text).toContain("765 / 1,234 objects");
    expect(text).toContain("Cloning… 62%");
    expect(text).toContain("Cancel stops git and deletes the partial folder.");
    expect(document.querySelector('[aria-current="step"]')?.textContent).toBe("Receiving");
    await act(async () => mocks.finish?.());
  });

  it("keeps Cancel live during a clone and stops git with it", async () => {
    const id = await startClone();
    expect(button("Cancel").disabled).toBe(false);
    expect(document.querySelector<HTMLButtonElement>('button[aria-label="Cancel clone"]')?.disabled).toBe(false);
    await act(async () => button("Cancel").click());
    expect(mocks.commands.CancelClone).toHaveBeenCalledWith(id);
    expect(button("Cancelling…").disabled).toBe(true);
    await act(async () => mocks.finish?.(new Error("Clone cancelled.")));
    expect(mocks.closeAddCloneModal).toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("Couldn't clone");
  });

  it("stops a clone on a paired computer there", async () => {
    useAppStore.setState({ addProjectTarget: { slug: "aaaa1111", alias: "Office PC" } });
    const id = await startClone();
    await act(async () => button("Cancel").click());
    expect(mocks.commands.CancelClone).toHaveBeenCalledWith(`peer-aaaa1111-${id}`);
    await act(async () => mocks.finish?.(new Error("Clone cancelled.")));
  });

  it("still reports a clone that failed on its own", async () => {
    await startClone();
    await act(async () => mocks.finish?.(new Error("Repository not found. Check the URL and your access.")));
    expect(document.body.textContent).toContain("Couldn't clone the repository. Repository not found.");
    expect(mocks.closeAddCloneModal).not.toHaveBeenCalled();
  });
});
