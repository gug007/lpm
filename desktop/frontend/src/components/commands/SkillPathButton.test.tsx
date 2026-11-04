// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { revealLabel } from "../../machineWords";
import { prefixRoot } from "../../peer/markers";
import { SkillPathButton } from "./SkillPathButton";
import type { SkillFileReach } from "./skillFile";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const bridge = vi.hoisted(() => ({
  RevealInFinder: vi.fn<(path: string) => Promise<void>>(() => Promise.resolve()),
  SetClipboardText: vi.fn<(text: string) => Promise<void>>(() => Promise.resolve()),
}));
vi.mock("../../../bridge/commands", () => bridge);

const LOCAL = "/Users/me/app/.claude/skills/lesson/SKILL.md";
const HOST = "/Users/them/app/.claude/skills/lesson/SKILL.md";

describe("a skill's path in the footer", () => {
  let host: HTMLDivElement;
  let root: Root;
  const open = vi.fn<(path: string) => void>();

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    vi.clearAllMocks();
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  function show(path: string | null, reach: SkillFileReach = "here") {
    act(() =>
      root.render(
        <SkillPathButton
          label=".claude/skills/lesson/SKILL.md"
          path={path}
          scope="project"
          files={{ reachOf: () => reach, open }}
        />,
      ),
    );
  }

  const button = () => host.querySelector<HTMLButtonElement>("button[aria-haspopup]");
  const items = () =>
    [...host.querySelectorAll<HTMLButtonElement>('button:not([aria-haspopup])')].map((b) => b.textContent);
  const pick = (label: string) => {
    const item = [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === label);
    act(() => item!.click());
  };
  const choose = (label: string) => {
    act(() => button()!.click());
    pick(label);
  };

  it("is plain text until the file is on disk", () => {
    show(null);
    expect(button()).toBeNull();
    expect(host.textContent).toContain(".claude/skills/lesson/SKILL.md");
  });

  it("offers everything for a file on this computer", () => {
    show(LOCAL);
    expect(button()?.title).toBe(LOCAL);
    act(() => button()!.click());
    expect(button()?.getAttribute("aria-expanded")).toBe("true");
    expect(items()).toEqual(["Open SKILL.md", revealLabel(), "Copy path"]);
  });

  it("opens, reveals and copies the file, then closes", () => {
    show(LOCAL);
    choose("Open SKILL.md");
    expect(open).toHaveBeenCalledWith(LOCAL);
    expect(button()?.getAttribute("aria-expanded")).toBe("false");
    choose(revealLabel());
    expect(bridge.RevealInFinder).toHaveBeenCalledWith(LOCAL);
    choose("Copy path");
    expect(bridge.SetClipboardText).toHaveBeenCalledWith(LOCAL);
  });

  it("has no Reveal for a paired computer's file, and copies the host's own path", () => {
    show(prefixRoot("abcd1234", HOST), "paired");
    expect(button()?.title).toBe(HOST);
    act(() => button()!.click());
    expect(items()).toEqual(["Open SKILL.md", "Copy path"]);
    pick("Copy path");
    expect(bridge.SetClipboardText).toHaveBeenCalledWith(HOST);
  });

  it("can only copy a file on an SSH host", () => {
    show(HOST, "ssh");
    act(() => button()!.click());
    expect(items()).toEqual(["Copy path"]);
  });
});
