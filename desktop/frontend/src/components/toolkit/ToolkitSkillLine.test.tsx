// @vitest-environment happy-dom
import { useState } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SkillDestination } from "../../toolkitSkill";
import { draftLine } from "../../toolkitSkillLine";
import { ToolkitSkillLine } from "./ToolkitSkillLine";

const DESTS: SkillDestination[] = [
  { path: "/h/.claude/skills", cli: "claude", scope: "user", label: "Claude Code", exists: true },
  {
    path: "/p/.claude/skills",
    cli: "claude",
    scope: "project",
    label: "Claude Code, in this project",
    exists: true,
  },
  {
    path: "/h/.agents/skills",
    cli: "codex",
    scope: "user",
    label: "Codex, Gemini and OpenCode",
    exists: false,
  },
];

const onSubmit = vi.fn();

// The parent owns the value the way ToolkitCreate does — including the
// slugify-on-type pass, which is half of what the field's grammar is.
function Harness({ start = "", startDest = DESTS[0].path }: { start?: string; startDest?: string }) {
  const [value, setValue] = useState(start);
  const [destPath, setDestPath] = useState(startDest);
  const [manual, setManual] = useState(false);
  const dest = DESTS.find((d) => d.path === destPath) ?? null;
  return (
    <ToolkitSkillLine
      value={value}
      onValue={(next) => setValue(draftLine(next))}
      destinations={DESTS}
      destPath={destPath}
      onDest={setDestPath}
      manual={manual && dest?.cli === "claude"}
      manualAllowed={dest?.cli === "claude"}
      onManual={setManual}
      slash="/deploy-web"
      onSubmit={onSubmit}
      inputRef={{ current: null }}
    />
  );
}

let host: HTMLDivElement;
let root: Root;

function render(props: { start?: string; startDest?: string } = {}) {
  act(() => {
    root.render(<Harness {...props} />);
  });
}

function input(): HTMLInputElement {
  return document.querySelector("input") as HTMLInputElement;
}

function type(text: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
      input(),
      text,
    );
    input().dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function press(key: string, init: KeyboardEventInit = {}) {
  act(() => {
    input().dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...init }));
  });
}

function options(): HTMLButtonElement[] {
  return [...document.querySelectorAll('[role="option"]')] as HTMLButtonElement[];
}

function chips(): string[] {
  return [...document.querySelectorAll('[class*="font-mono"]')]
    .filter((el) => el.tagName === "BUTTON")
    .map((el) => el.textContent?.trim() ?? "");
}

beforeEach(() => {
  onSubmit.mockReset();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("ToolkitSkillLine", () => {
  it("shows the folder it will use as a chip, before anything is chosen", () => {
    render();
    expect(chips()).toContain("@claude");
  });

  it("moves the skill with @, and takes the fragment back out of the name", () => {
    render({ start: "deploy-web" });
    type("deploy-web @pro");
    expect(options().map((o) => o.textContent)).toHaveLength(1);
    press("Enter");
    expect(input().value).toBe("deploy-web");
    expect(chips()).toContain("@project");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("keeps each trigger to its own vocabulary", () => {
    render({ start: "deploy-web" });
    type("deploy-web /");
    const shown = options().map((o) => o.textContent ?? "");
    expect(shown).toHaveLength(1);
    expect(shown[0]).toContain("/manual");
  });

  it("turns the mode on with /, and off again with backspace on an empty line", () => {
    render();
    type("/manual");
    press("Enter");
    expect(chips()).toContain("/manual");
    expect(input().value).toBe("");
    press("Backspace");
    expect(chips()).not.toContain("/manual");
  });

  it("offers manual greyed out where the key would be ignored", () => {
    render({ startDest: "/h/.agents/skills" });
    type("/");
    const [mode] = options();
    expect(mode.disabled).toBe(true);
    expect(mode.textContent).toContain("Only Claude Code");
  });

  it("submits on Enter, but only once the list is out of the way", () => {
    render({ start: "deploy-web" });
    type("deploy-web @");
    press("Enter");
    expect(onSubmit).not.toHaveBeenCalled();
    press("Enter");
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("keeps Escape from reaching the sub-view while the list is open", () => {
    const onEscape = vi.fn();
    document.addEventListener("keydown", onEscape);
    render({ start: "deploy-web" });
    type("deploy-web @");
    press("Escape");
    expect(onEscape).not.toHaveBeenCalled();
    expect(input().value).toBe("deploy-web");
    press("Escape");
    expect(onEscape).toHaveBeenCalledTimes(1);
    document.removeEventListener("keydown", onEscape);
  });
});
