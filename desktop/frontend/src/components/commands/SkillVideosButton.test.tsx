// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lessonUrl } from "../../lessons";
import { SKILL_VIDEOS } from "./skillVideos";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const open = vi.hoisted(() => vi.fn());
vi.mock("../../../bridge/runtime", () => ({ BrowserOpenURL: open }));

import { SkillVideosButton } from "./SkillVideosButton";

describe("the Skills tab's Video guides menu", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    vi.clearAllMocks();
    act(() => root.render(<SkillVideosButton />));
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  const trigger = () => host.querySelector("button")!;
  const rows = () => Array.from(host.querySelectorAll<HTMLButtonElement>("[data-context-menu] button"));

  it("stays shut until it's pressed", () => {
    expect(trigger().textContent).toBe("Video guides");
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(rows()).toHaveLength(0);
  });

  it("lists each video once, with its length", () => {
    act(() => trigger().click());
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    expect(rows().map((row) => row.textContent)).toEqual(SKILL_VIDEOS.map((v) => `${v.title}${v.length}`));
  });

  it("opens the video in the browser and closes", () => {
    act(() => trigger().click());
    act(() => rows()[1].click());
    expect(open).toHaveBeenCalledExactlyOnceWith(lessonUrl(SKILL_VIDEOS[1].id));
    expect(rows()).toHaveLength(0);
  });

  it("closes when pressed again", () => {
    act(() => trigger().click());
    act(() => trigger().click());
    expect(rows()).toHaveLength(0);
    expect(open).not.toHaveBeenCalled();
  });
});
