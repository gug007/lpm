// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PeerStatus } from "../peer/peerStatus";
import type { ProjectInfo } from "../types";

const mocks = vi.hoisted(() => ({
  clearSelection: vi.fn(),
  addProjectForPeer: vi.fn(),
  setAlias: vi.fn(() => Promise.resolve()),
  remotePair: vi.fn(() =>
    Promise.resolve({
      code: "AB12-CD34",
      url: "lpm://pair?p=8765&c=AB12-CD34&h=10.0.0.2&f=ab",
      svg: "<svg></svg>",
      host: "10.0.0.2",
      hosts: ["10.0.0.2"],
      port: 8765,
    }),
  ),
}));

vi.mock("../store/app", () => ({
  useAppStore: (select: (state: unknown) => unknown) => select(mocks),
}));
vi.mock("../../bridge/commands", () => ({
  PeerRemove: vi.fn(),
  PeerReconnect: vi.fn(),
  PeerSetAlias: mocks.setAlias,
  PeerRemotePair: mocks.remotePair,
}));

import { SidebarPeerSection } from "./SidebarPeerSection";

const LIVE: PeerStatus = { tone: "live", text: "Connected", detail: "" };
const OFF: PeerStatus = { tone: "off", text: "Off", detail: "" };
const UNREACHABLE: PeerStatus = {
  tone: "error",
  text: "Not responding — it may be asleep or on another network",
  detail: "Operation timed out (os error 60)",
};

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
        strays={[]}
        selected={null}
        {...(props as object)}
      >
        <div data-testid="rows">glimpse2 row</div>
      </SidebarPeerSection>,
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

describe("SidebarPeerSection rows", () => {
  it("shows the rows it is handed only while open", () => {
    const header = render();
    expect(container.querySelector("[data-testid=rows]")).toBeTruthy();

    act(() => {
      header.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.querySelector("[data-testid=rows]")).toBeNull();
    expect(header.textContent).toContain("1");
  });
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

  it("says what went wrong with the machine while the section is open", () => {
    const header = render({
      connected: false,
      status: UNREACHABLE,
      projects: [],
      strays: [{ project: project("kb"), label: "kb", follow: {} }],
    });
    expect(header.textContent).toContain("Not responding");
  });

  it("drops the failure line when folded, leaving the count the plate's tint stands behind", () => {
    localStorage.setItem("lpm-peer-sections-collapsed", JSON.stringify({ aabbccdd: true }));
    const header = render({
      connected: false,
      status: UNREACHABLE,
      projects: [],
      strays: [{ project: project("kb"), label: "kb", follow: {} }],
    });
    expect(header.textContent).not.toContain("Not responding");
    expect(header.textContent).toContain("1");
    expect(container.querySelector(".text-\\[var\\(--accent-red-text\\)\\]")).toBeTruthy();
  });

  it("stays plain while expanded, since the selected row speaks for itself", () => {
    expect(render({ selected: "glimpse2" }).className).not.toContain("bg-[var(--bg-active)]");
  });

  it("wears the active background when folded over the open project", () => {
    localStorage.setItem("lpm-peer-sections-collapsed", JSON.stringify({ aabbccdd: true }));
    expect(render({ selected: "glimpse2" }).className).toContain("bg-[var(--bg-active)]");
  });

  it("renames the machine from its own menu, without touching the address", () => {
    render();
    const more = container.querySelector(
      '[aria-label="Options for GURGENS-MACBOOK-PRO"]',
    ) as HTMLButtonElement;
    act(() => more.click());
    const rename = [...document.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "Rename",
    );
    expect(rename).toBeTruthy();
    act(() => rename!.click());
    const input = document.querySelector("input") as HTMLInputElement;
    // Pre-filled with the name on screen, so a tweak doesn't mean retyping it.
    expect(input.value).toBe("GURGENS-MACBOOK-PRO");
    const form = input.closest("form") as HTMLFormElement;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        input,
        "Studio",
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(mocks.setAlias).toHaveBeenCalledWith("aabbccdd", "Studio");
  });

  it("stays plain when folded over a project that is not the open one", () => {
    localStorage.setItem("lpm-peer-sections-collapsed", JSON.stringify({ aabbccdd: true }));
    expect(render({ selected: "something-else" }).className).not.toContain("bg-[var(--bg-active)]");
  });

  it("pairs a phone from its own menu, showing that machine's QR", async () => {
    render();
    const more = container.querySelector(
      '[aria-label="Options for GURGENS-MACBOOK-PRO"]',
    ) as HTMLButtonElement;
    act(() => more.click());
    const pair = [...document.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "Pair a phone…",
    );
    expect(pair).toBeTruthy();
    await act(async () => pair!.click());
    // The host mints the code — its addresses and certificate are the ones the
    // phone must reach — so the QR and code shown are what IT handed back.
    expect(mocks.remotePair).toHaveBeenCalledWith("aabbccdd");
    expect(document.body.textContent).toContain("Pair a device with GURGENS-MACBOOK-PRO");
    // Its code only works on that machine's network, so it waits for consent.
    expect(document.body.textContent).not.toContain("AB12-CD34");
    const local = [...document.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "Pair for this network only",
    );
    await act(async () => local!.click());
    expect(document.body.textContent).toContain("AB12-CD34");
  });

  function disconnectDialogText(props: Record<string, unknown>): string {
    render(props);
    const more = container.querySelector(
      '[aria-label="Options for GURGENS-MACBOOK-PRO"]',
    ) as HTMLButtonElement;
    act(() => more.click());
    const disconnect = [...document.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "Disconnect…",
    );
    act(() => disconnect!.click());
    return document.body.textContent ?? "";
  }

  // macOS has always titled a server's dialog this way; only a Linux or
  // Windows desktop, which it never had, reads otherwise.
  it("keeps the disconnect title macOS always showed", () => {
    expect(disconnectDialogText({})).toContain("Disconnect Mac");
  });

  it("keeps the disconnect title macOS always showed for a server", () => {
    expect(disconnectDialogText({ linuxHost: true, noun: "server" })).toContain("Disconnect Mac");
  });

  it("names a Linux or Windows desktop for what it is", () => {
    expect(disconnectDialogText({ noun: "computer" })).toContain("Disconnect computer");
  });

  it("offers phone pairing only while the machine is reachable", () => {
    render({ connected: false, status: OFF });
    const more = container.querySelector(
      '[aria-label="Options for GURGENS-MACBOOK-PRO"]',
    ) as HTMLButtonElement;
    act(() => more.click());
    const pair = [...document.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "Pair a phone…",
    );
    expect(pair).toBeUndefined();
  });
});
