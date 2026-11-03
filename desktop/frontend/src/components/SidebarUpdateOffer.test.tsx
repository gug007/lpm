// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({ notes: vi.fn<(since: string, until: string) => Promise<unknown>>() }));

vi.mock("../../bridge/commands", () => ({ ReleaseNotes: bridge.notes }));
vi.mock("../releasePage", () => ({ UPDATES_INSTALL_IN_APP: true }));
vi.mock("../diagnostics", () => ({ logDiagnostic: vi.fn() }));

import { useReleaseNotes } from "../store/releaseNotes";
import { SidebarUpdateOffer, UPDATE_NOTES_HOVER_MS } from "./SidebarUpdateOffer";

let host: HTMLDivElement;
let root: Root;
const onUpdate = vi.fn();

const release = (version: string, notes: string, publishedAt = new Date().toISOString()) => ({
  version,
  publishedAt,
  notes,
  beta: false,
});

const row = () => document.querySelector<HTMLButtonElement>('button[aria-label="Update to 0.7.49"]')!;
const card = () => document.querySelector('[role="tooltip"]');
const flush = () => act(async () => {});

async function mount(since = "0.7.47") {
  act(() =>
    root.render(
      <SidebarUpdateOffer currentVersion={since} latestVersion="0.7.49" className="" onUpdate={onUpdate} />,
    ),
  );
  await flush();
}

async function hover() {
  act(() => row().dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
  await act(async () => vi.advanceTimersByTime(UPDATE_NOTES_HOVER_MS));
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  useReleaseNotes.setState({}, true);
  bridge.notes.mockReset();
  onUpdate.mockReset();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

describe("SidebarUpdateOffer", () => {
  it("lists every release since the running one when hovered", async () => {
    bridge.notes.mockResolvedValue({
      releases: [release("0.7.49", "Switch accounts mid-session."), release("0.7.48", "")],
      complete: true,
    });
    await mount();
    expect(bridge.notes).toHaveBeenCalledWith("0.7.47", "0.7.49");

    act(() => row().dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
    expect(card()).toBeNull();
    await act(async () => vi.advanceTimersByTime(UPDATE_NOTES_HOVER_MS));

    const text = card()?.textContent ?? "";
    expect(text).toContain("2 releases behind");
    expect(text).toContain("Switch accounts mid-session.");
    expect(text).toContain("Latest");
    expect(text).toContain("Today");
    expect(text).toContain("No release notes");
    expect(text).toContain("0.7.47You're here");
    expect(row().getAttribute("aria-describedby")).toBe(card()?.id);

    act(() => row().dispatchEvent(new MouseEvent("mouseout", { bubbles: true })));
    expect(card()).toBeNull();
  });

  it("counts the releases it doesn't list, and says when there were more than it could fetch", async () => {
    bridge.notes.mockResolvedValue({
      releases: ["0.7.49", "0.7.48", "0.7.47", "0.7.46", "0.7.45", "0.7.44", "0.7.43"].map((v) =>
        release(v, `Notes for ${v}.`),
      ),
      complete: false,
    });
    await mount("0.6.0");
    await hover();

    const text = card()?.textContent ?? "";
    expect(text).toContain("7+ releases behind");
    expect(text).toContain("Notes for 0.7.45.");
    expect(text).not.toContain("Notes for 0.7.44.");
    expect(text).toContain("2+ earlier releases");
  });

  it("says when the notes couldn't be loaded, and asks again on the next hover", async () => {
    bridge.notes.mockRejectedValueOnce(new Error("offline"));
    await mount();
    bridge.notes.mockResolvedValue({ releases: [release("0.7.49", "Back online.")], complete: true });

    act(() => row().dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
    expect(bridge.notes).toHaveBeenCalledTimes(2);
    await act(async () => vi.advanceTimersByTime(UPDATE_NOTES_HOVER_MS));
    expect(card()?.textContent).toContain("Back online.");
  });

  it("shows the failure when the second try fails too", async () => {
    bridge.notes.mockRejectedValue(new Error("offline"));
    await mount();
    await hover();
    expect(card()?.textContent).toContain("Couldn't load the release notes.");
  });

  it("closes the card and updates when clicked", async () => {
    bridge.notes.mockResolvedValue({ releases: [release("0.7.49", "Notes.")], complete: true });
    await mount();
    await hover();
    expect(card()).not.toBeNull();

    act(() => row().click());
    expect(card()).toBeNull();
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });
});
