// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComposerToolId } from "../composerTools";
import { useSettingsStore } from "../store/settings";
import { ComposerToolbarSlot } from "./ComposerToolbarSlot";

let host: HTMLDivElement;
let root: Root;
let saved: Record<string, unknown>[];

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  saved = [];
  useSettingsStore.setState({
    composerToolsNewUntil: undefined,
    update: async (partial) => {
      saved.push(partial);
      useSettingsStore.setState(partial);
    },
  });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

async function render(id: ComposerToolId) {
  await act(async () =>
    root.render(
      <ComposerToolbarSlot id={id} isDefault onMove={() => {}} onReset={() => {}}>
        <button type="button" onClick={vi.fn()} />
      </ComposerToolbarSlot>,
    ),
  );
}

const dot = () => host.querySelector("[data-new-dot]");
const until = () => useSettingsStore.getState().composerToolsNewUntil?.video;

describe("ComposerToolbarSlot new dot", () => {
  it("starts a new tool's week the first time it's on screen", async () => {
    const before = Date.now();
    await render("video");
    expect(dot()).not.toBeNull();
    expect(until()).toBeGreaterThan(before);
    expect(saved).toHaveLength(1);
  });

  it("retires the dot on the first hover", async () => {
    await render("video");
    await act(async () => {
      host.querySelector("button")!.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    expect(until()).toBe(0);
    expect(dot()).toBeNull();
  });

  it("retires it on a click too", async () => {
    await render("video");
    await act(async () => host.querySelector("button")!.click());
    expect(until()).toBe(0);
  });

  it("never marks a tool that isn't announced", async () => {
    await render("memory");
    expect(dot()).toBeNull();
    expect(saved).toEqual([]);
  });
});
