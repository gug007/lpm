// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectInfo, StatusEntry } from "../types";
import type { TerminalTargetInfo } from "../store/terminalTargets";

const mocks = vi.hoisted(() => ({
  peerState: vi.fn(),
  projects: [] as ProjectInfo[],
  mru: [] as string[],
  byProject: {} as Record<string, TerminalTargetInfo[]>,
  globalEntries: [] as StatusEntry[],
  pick: vi.fn(),
}));

vi.mock("../../bridge/commands", () => ({ PeerState: mocks.peerState }));
vi.mock("../../bridge/runtime", () => ({ EventsOn: vi.fn(() => () => {}) }));
vi.mock("../peer/usePeerState", () => ({
  peerAliasMap: (peers: Array<{ slug: string; alias: string }>) =>
    Object.fromEntries(peers.map((p) => [p.slug, p.alias])),
}));
vi.mock("../store/app", () => ({
  useAppStore: (select: (state: unknown) => unknown) =>
    select({ projects: mocks.projects, mruProjects: mocks.mru }),
}));
vi.mock("../store/terminalTargets", () => ({
  useTerminalTargets: (select: (state: unknown) => unknown) =>
    select({ byProject: mocks.byProject }),
}));
vi.mock("../store/globalAgentStatus", () => ({
  useGlobalAgentStatus: (select: (state: unknown) => unknown) =>
    select({ entries: mocks.globalEntries }),
}));

import { SendToTerminalModal } from "./SendToTerminalModal";
import { STATUS_RUNNING, STATUS_WAITING } from "../types";

const T0 = 1_700_000_000_000;

function project(name: string, entries: StatusEntry[] = []): ProjectInfo {
  return {
    name,
    session: name,
    root: `/Users/dev/${name}`,
    running: false,
    services: [],
    allServices: [],
    actions: [],
    profiles: [],
    activeProfile: "",
    statusEntries: entries,
    isRemote: false,
  };
}

function entry(paneID: string, value: string): StatusEntry {
  return { key: `claude_code_${paneID}`, value, priority: 0, timestamp: T0, paneID };
}

const tab = (id: string, label: string): TerminalTargetInfo => ({
  id,
  label,
  emoji: "",
  historyKey: `hk-${id}`,
});

let container: HTMLDivElement;
let root: Root;

async function render(props: Partial<Parameters<typeof SendToTerminalModal>[0]> = {}) {
  await act(async () => {
    root.render(
      <SendToTerminalModal
        open
        onClose={() => {}}
        sourceProject="api"
        sourceTerminalId="api-1"
        hasImages={false}
        busy={false}
        onPick={mocks.pick}
        {...props}
      />,
    );
  });
}

function rowButtons(): HTMLButtonElement[] {
  return [...document.body.querySelectorAll<HTMLButtonElement>("button[data-active]")];
}

function rowLabels(): string[] {
  return rowButtons().map((b) => (b.textContent ?? "").replace(/\s+/g, " ").trim());
}

function click(el: Element | undefined) {
  act(() => {
    el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

// React tracks the input's value setter, so a plain assignment fires no change.
const setInputValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;

function typeInSearch(value: string) {
  const input = document.body.querySelector("input") as HTMLInputElement;
  act(() => {
    setInputValue.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function pressInSearch(key: string, meta = false) {
  const input = document.body.querySelector("input") as HTMLInputElement;
  act(() => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key, metaKey: meta, bubbles: true }));
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.peerState.mockResolvedValue({ peers: [] });
  mocks.pick.mockClear();
  mocks.projects = [project("api"), project("web")];
  mocks.mru = ["api", "web"];
  mocks.byProject = {
    api: [tab("api-1", "Claude"), tab("api-2", "Shell")],
    web: [tab("web-1", "Codex")],
  };
  mocks.globalEntries = [];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
});

describe("SendToTerminalModal", () => {
  it("lists every other open tab and never the one being written in", async () => {
    await render();
    expect(rowLabels()).toEqual(["Shell", "Codex"]);
  });

  it("sends to the tab that was clicked", async () => {
    await render();
    click(rowButtons()[1]);
    expect(mocks.pick).toHaveBeenCalledWith(
      expect.objectContaining({ terminalId: "web-1", projectName: "web" }),
      "send",
    );
  });

  it("moves with the row's second verb", async () => {
    await render();
    const move = [...document.body.querySelectorAll("button")].find(
      (b) => b.textContent === "Move",
    );
    click(move);
    expect(mocks.pick).toHaveBeenCalledWith(expect.objectContaining({ terminalId: "api-2" }), "move");
  });

  it("sends on ↵ and moves on ⌘↵, following the arrow keys", async () => {
    await render();
    pressInSearch("ArrowDown");
    pressInSearch("Enter");
    expect(mocks.pick).toHaveBeenLastCalledWith(
      expect.objectContaining({ terminalId: "web-1" }),
      "send",
    );
    pressInSearch("Enter", true);
    expect(mocks.pick).toHaveBeenLastCalledWith(
      expect.objectContaining({ terminalId: "web-1" }),
      "move",
    );
  });

  it("filters by tab name", async () => {
    await render();
    typeInSearch("cod");
    expect(rowLabels()).toEqual(["Codex"]);
  });

  it("leads with move for a tab whose agent has a permission prompt open", async () => {
    mocks.projects = [project("api"), project("web", [entry("web-1", STATUS_WAITING)])];
    await render();
    const row = rowButtons().find((b) => (b.textContent ?? "").includes("Codex"));
    click(row);
    expect(mocks.pick).toHaveBeenCalledWith(expect.objectContaining({ terminalId: "web-1" }), "move");
    expect([...document.body.querySelectorAll("button")].some((b) => b.textContent === "Send anyway")).toBe(true);
  });

  it("still sends to a tab that is merely busy", async () => {
    mocks.projects = [project("api"), project("web", [entry("web-1", STATUS_RUNNING)])];
    await render();
    const row = rowButtons().find((b) => (b.textContent ?? "").includes("Codex"));
    expect((row?.textContent ?? "").includes("Working")).toBe(true);
    click(row);
    expect(mocks.pick).toHaveBeenCalledWith(expect.objectContaining({ terminalId: "web-1" }), "send");
  });

  it("refuses a tab on another Mac while the prompt carries images", async () => {
    mocks.byProject = {
      api: [tab("api-1", "Claude")],
      "peer-a1b2c3d4-web": [tab("peer-a1b2c3d4-web-1", "Codex")],
    };
    mocks.projects = [project("api"), project("peer-a1b2c3d4-web")];
    await render({ hasImages: true });
    const row = rowButtons()[0];
    expect(row.disabled).toBe(true);
    expect((row.textContent ?? "").includes("Another Mac")).toBe(true);
    click(row);
    expect(mocks.pick).not.toHaveBeenCalled();
  });

  it("says why there is nothing to send to", async () => {
    mocks.byProject = { api: [tab("api-1", "Claude")] };
    await render();
    expect(document.body.textContent).toContain("only projects you've opened this session");
  });
});
