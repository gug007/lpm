// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PeerStatus } from "../peer/peerStatus";
import type { ProjectInfo } from "../types";

const mocks = vi.hoisted(() => ({ clearSelection: vi.fn(), addProjectForPeer: vi.fn() }));

vi.mock("../store/app", () => ({
  useAppStore: (select: (state: unknown) => unknown) => select(mocks),
}));
vi.mock("../../bridge/commands", () => ({ PeerRemove: vi.fn(), PeerReconnect: vi.fn() }));

import { SidebarPeerSection } from "./SidebarPeerSection";

const LIVE: PeerStatus = { tone: "live", text: "Connected", detail: "" };
const OFF: PeerStatus = { tone: "off", text: "Off", detail: "" };

function project(name: string, running = false): ProjectInfo {
  return {
    name,
    session: name,
    root: `/@peer-aabbccdd/Users/dev/${name}`,
    label: name,
    running,
    services: [],
    allServices: [],
    actions: [],
    profiles: [],
    activeProfile: "",
    statusEntries: [],
  } as unknown as ProjectInfo;
}

let container: HTMLElement;
let root: Root;

function render(props: Record<string, unknown> = {}) {
  act(() => {
    root.render(
      <SidebarPeerSection
        slug="aabbccdd"
        alias="GURGENS-MACBOOK-PRO"
        host="100.84.12.3"
        connected
        linuxHost={false}
        status={LIVE}
        projects={[project("glimpse2", true)]}
        mirrors={new Map()}
        strays={[]}
        follows={new Map()}
        selected={null}
        onSelect={vi.fn()}
        onContextMenu={vi.fn()}
        {...(props as object)}
      />,
    );
  });
  return container.querySelector("button") as HTMLButtonElement;
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
});

describe("SidebarPeerSection header", () => {
  it("names the machine without a suffix, and never uppercases it", () => {
    const header = render();
    expect(header.textContent).toContain("GURGENS");
    expect(header.textContent).not.toContain("remote");
    expect(header.className).not.toContain("uppercase");
  });

  it("mutes only the sacrificial half of a hostname, and never twice-colours a span", () => {
    render();
    const spans = [...container.querySelectorAll("span")];
    const muted = spans.filter((s) => s.className.includes("text-[var(--text-muted)]"));
    // The tail is the half that fades; if it also carried the head's tone, the
    // stylesheet's order would decide the colour instead of this class.
    const tail = muted.find((s) => s.textContent === "-MACBOOK-PRO");
    expect(tail).toBeTruthy();
    expect(tail?.className).not.toContain("text-[var(--text-primary)]");
    expect(tail?.className).not.toContain("text-[var(--text-secondary)]");
  });

  it("keeps an address's last octet inelastic and lets its prefix give way", () => {
    render({ alias: "85.9.204.194", linuxHost: true });
    const spans = [...container.querySelectorAll("span")];
    const octet = spans.find((s) => s.textContent === "194");
    expect(octet?.className).toContain("flex-none");
    const prefix = spans.find((s) => s.textContent === "85.9.204.");
    expect(prefix?.className).toContain("min-w-0");
    expect(prefix?.className).not.toContain("flex-none");
  });

  it("lets a separator-less name shrink, so the row count is never pushed out", () => {
    render({ alias: "workstation" });
    const name = [...container.querySelectorAll("span")].find(
      (s) => s.textContent === "workstation",
    );
    expect(name?.className).toContain("min-w-0");
    expect(name?.className).not.toContain("flex-none");
  });

  it("says a sleeping machine is away, and what is still runnable here", () => {
    const header = render({
      connected: false,
      status: OFF,
      projects: [],
      strays: [
        { project: project("kb"), label: "kb", follow: {} },
        { project: project("notes"), label: "notes", follow: {} },
      ],
    });
    expect(header.textContent).toContain("Away");
    expect(header.textContent).toContain("2 copies here");
  });

  it("counts one copy as a copy", () => {
    const header = render({
      connected: false,
      status: OFF,
      projects: [],
      strays: [{ project: project("kb"), label: "kb", follow: {} }],
    });
    expect(header.textContent).toContain("1 copy here");
  });

  it("stays plain while expanded, since the selected row speaks for itself", () => {
    expect(render({ selected: "glimpse2" }).className).not.toContain("bg-[var(--bg-active)]");
  });

  it("wears the active background when folded over the open project", () => {
    localStorage.setItem("lpm-peer-sections-collapsed", JSON.stringify({ aabbccdd: true }));
    expect(render({ selected: "glimpse2" }).className).toContain("bg-[var(--bg-active)]");
  });

  it("stays plain when folded over a project that is not the open one", () => {
    localStorage.setItem("lpm-peer-sections-collapsed", JSON.stringify({ aabbccdd: true }));
    expect(render({ selected: "something-else" }).className).not.toContain("bg-[var(--bg-active)]");
  });
});
