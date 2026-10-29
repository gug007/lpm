// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  commands: {} as Record<string, ReturnType<typeof vi.fn>>,
  store: {
    addProjectPickerOpen: true,
    closeAddProjectPicker: vi.fn(),
    pickAddProjectKind: vi.fn(),
    addProjectTarget: null,
    addProjectStart: null,
    addProjectForPeer: vi.fn(),
    openSSHProject: vi.fn(),
    projects: [],
  },
}));

vi.mock("../../../bridge/commands", () =>
  new Proxy(
    {},
    {
      has: () => true,
      get: (_t, prop: string) =>
        prop === "then" ? undefined : (mocks.commands[prop] ??= vi.fn().mockResolvedValue(undefined)),
    },
  ),
);
vi.mock("../../../bridge/runtime", () => ({ BrowserOpenURL: vi.fn(), EventsOn: () => () => {} }));
vi.mock("../../store/app", () => ({
  useAppStore: (select: (state: unknown) => unknown) => select(mocks.store),
}));

import { NewProjectPicker } from "../NewProjectPicker";

const HOST = { enabled: false, port: 8766, running: false, guestsOnly: false, hostId: "", pairing: null, devices: [], pairRequests: [] };
const OFFICE = { slug: "aaaa1111", alias: "Office PC", host: "10.0.0.2", port: 8766, enabled: true, connected: true, platform: "windows" };
const BUILD_BOX = { slug: "dddd4444", alias: "Build box", host: "10.0.0.7", port: 8766, enabled: true, connected: true, platform: "linux", headless: true };

let container: HTMLDivElement;
let root: Root;

function command(name: string) {
  return (mocks.commands[name] ??= vi.fn().mockResolvedValue(undefined));
}

async function openServer(peers: unknown[]) {
  command("PeerState").mockResolvedValue({ host: HOST, peers });
  command("GetVersion").mockResolvedValue("0.7.30");
  act(() => root.render(<NewProjectPicker />));
  await act(async () => {});
  const server = [...document.body.querySelectorAll("button")].find((b) => b.textContent?.startsWith("Server"));
  await act(async () => server?.click());
  await act(async () => {});
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  for (const k of Object.keys(mocks.commands)) delete mocks.commands[k];
  vi.clearAllMocks();
});

describe("Add a project → Server", () => {
  it("lists the Linux hosts already there, how they update and what they sync", async () => {
    await openServer([OFFICE, BUILD_BOX]);

    const text = document.body.textContent;
    expect(text).toContain("Install lpm there");
    expect(text).toContain("Just SSH in");
    expect(text).toContain("Linux hosts you connect to");
    expect(text).toContain("Build box");
    expect(text).toContain("Update hosts automatically");
    expect(text).toContain("Config sync");
    expect(text).not.toContain("Office PC");
    expect(text).not.toContain("Add a Linux host");
  });

  it("offers only the ways to add one while there is no host", async () => {
    await openServer([OFFICE]);

    const text = document.body.textContent;
    expect(text).toContain("Install lpm there");
    expect(text).not.toContain("Linux hosts you connect to");
    expect(text).not.toContain("Config sync");
  });
});
