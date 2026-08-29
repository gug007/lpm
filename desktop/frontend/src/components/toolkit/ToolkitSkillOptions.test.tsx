// @vitest-environment happy-dom
import { useState } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SkillDestination } from "../../toolkitSkill";
import { ToolkitSkillOptions } from "./ToolkitSkillOptions";

const DESTS: SkillDestination[] = [
  { path: "/h/.claude/skills", cli: "claude", scope: "user", label: "Claude Code", exists: true },
  {
    path: "/p/.claude/skills",
    cli: "claude",
    scope: "project",
    label: "Claude Code, in this project",
    exists: false,
  },
  { path: "/h/.codex/skills", cli: "codex", scope: "user", label: "Codex", exists: true },
  {
    path: "/h/.agents/skills",
    cli: "codex",
    scope: "user",
    label: "Codex, Gemini and OpenCode",
    exists: true,
  },
];

// A folder whose CLI honours no opt-out, so the "Only you" option is disabled.
const GEMINI: SkillDestination = {
  path: "/h/.gemini/skills",
  cli: "gemini",
  scope: "user",
  label: "Gemini",
  exists: true,
};

// The parent owns both choices the way ToolkitCreate does, down to the token
// the chosen folder's CLI is invoked with.
function Harness({
  startDest = DESTS[0].path,
  dests = DESTS,
}: {
  startDest?: string;
  dests?: SkillDestination[];
}) {
  const [destPath, setDestPath] = useState(startDest);
  const [manual, setManual] = useState(false);
  const dest = dests.find((d) => d.path === destPath) ?? null;
  const manualAllowed = dest?.cli === "claude" || dest?.cli === "codex";
  return (
    <ToolkitSkillOptions
      destinations={dests}
      destPath={destPath}
      onDest={setDestPath}
      manual={manual && manualAllowed}
      manualAllowed={manualAllowed}
      onManual={setManual}
      invocation={`${dest?.cli === "codex" ? "$" : "/"}deploy-web`}
    />
  );
}

let host: HTMLDivElement;
let root: Root;

function render(props: { startDest?: string; dests?: SkillDestination[] } = {}) {
  act(() => {
    root.render(<Harness {...props} />);
  });
}

// The collapsed control: its label, the chosen title, and the note left
// standing underneath.
function field(label: string): HTMLElement {
  const tag = [...host.querySelectorAll("span")].find(
    (s) => s.id.endsWith("-label") && s.textContent === label,
  );
  if (!tag?.parentElement) throw new Error(`no ${label} field`);
  return tag.parentElement;
}

function trigger(label: string): HTMLButtonElement {
  const found = field(label).querySelector<HTMLButtonElement>('[role="combobox"]');
  if (!found) throw new Error(`no ${label} trigger`);
  return found;
}

function open(label: string): HTMLElement {
  if (trigger(label).getAttribute("aria-expanded") !== "true") click(trigger(label));
  const list = document.querySelector<HTMLElement>(`[role="listbox"][aria-label="${label}"]`);
  if (!list) throw new Error(`${label} did not open`);
  return list;
}

function options(label: string): HTMLButtonElement[] {
  return [...open(label).querySelectorAll("button")];
}

function option(label: string, title: string): HTMLButtonElement {
  const found = options(label).find((b) => b.textContent?.startsWith(title));
  if (!found) throw new Error(`no ${label} option titled ${title}`);
  return found;
}

function mark(el: HTMLElement): string | null {
  return el.querySelector("[data-mark]")?.getAttribute("data-mark") ?? null;
}

function click(button: HTMLButtonElement) {
  act(() => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function mouseDown(target: Element) {
  act(() => {
    target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  });
}

function press(el: HTMLElement, key: string) {
  act(() => {
    el.focus();
    el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
}

function highlighted(label: string): string {
  const id = trigger(label).getAttribute("aria-activedescendant");
  const el = id ? document.getElementById(id) : null;
  return el?.textContent ?? "";
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("ToolkitSkillOptions", () => {
  // Collapsed, the field reads exactly as the option does in the open list:
  // the title over the sentence that explains it — for a folder, the path it
  // writes to.
  it("shows the chosen folder with its path, closed", () => {
    render();
    expect(trigger("Folder").textContent).toContain("Claude Code");
    expect(trigger("Folder").textContent).toContain("/h/.claude/skills");
    expect(document.querySelector('[role="listbox"]')).toBeNull();
  });

  // The dialog hosting the form is itself a portalled modal overlay, and the
  // list hangs off a field inside it: a click anywhere else in that dialog is
  // an outside click, not a layer above the list.
  it("closes on a click elsewhere in the dialog, but not inside itself", () => {
    host.setAttribute("data-modal-overlay", "");
    render();
    const list = open("Folder");
    mouseDown(list);
    expect(document.querySelector('[role="listbox"]')).not.toBeNull();
    mouseDown(host);
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    expect(trigger("Folder").textContent).toContain("Claude Code");
  });

  it("offers one option per folder, with the path it writes to", () => {
    render();
    expect(options("Folder")).toHaveLength(4);
    expect(option("Folder", "Claude Code").textContent).toContain("/h/.claude/skills");
    expect(option("Folder", "Codex, Gemini and OpenCode").textContent).toContain(
      "/h/.agents/skills",
    );
  });

  it("says which folder does not exist yet", () => {
    render();
    expect(option("Folder", "Claude Code, in this project").textContent).toContain(
      "will be created",
    );
    expect(option("Folder", "Claude Code").textContent).not.toContain("will be created");
  });

  it("marks the chosen folder, and moves and closes on click", () => {
    render();
    expect(option("Folder", "Claude Code").getAttribute("aria-selected")).toBe("true");
    click(option("Folder", "Codex, Gemini and OpenCode"));
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    expect(trigger("Folder").textContent).toContain("Codex, Gemini and OpenCode");
    expect(trigger("Folder").textContent).toContain("/h/.agents/skills");
    expect(option("Folder", "Claude Code").getAttribute("aria-selected")).toBe("false");
  });

  it("defaults to the agent picking it up, and keeps it to you on request", () => {
    render();
    expect(trigger("Who runs it").textContent).toContain("Your agent");
    expect(trigger("Who runs it").textContent).toContain("description matches");
    click(option("Who runs it", "Only you"));
    expect(trigger("Who runs it").textContent).toContain("Only you");
  });

  // The two CLIs are typed differently — Claude takes /name, Codex $name — and
  // an option that names the wrong one teaches a keystroke that does nothing.
  it("names the thing the user types, in the chosen CLI's own form", () => {
    render();
    expect(option("Who runs it", "Only you").textContent).toContain("/deploy-web");
    press(trigger("Who runs it"), "Escape");
    click(option("Folder", "Codex"));
    expect(option("Who runs it", "Only you").textContent).toContain("$deploy-web");
  });

  it("offers the opt-out under a Codex folder too", () => {
    render({ startDest: "/h/.codex/skills" });
    const only = option("Who runs it", "Only you");
    expect(only.disabled).toBe(false);
    expect(only.textContent).toContain("agents never trigger it");
  });

  // The shared folder is three CLIs' and only Codex honours the opt-out, so the
  // option has to say so rather than promise the skill is held back everywhere.
  it("says who still picks it up in the shared folder", () => {
    render({ startDest: "/h/.agents/skills" });
    const note = option("Who runs it", "Only you").textContent ?? "";
    expect(note).toContain("only Codex holds it back");
    expect(note).toContain("Gemini and OpenCode");
  });

  // The label runs out of room in a collapsed line long before the mark does,
  // and which CLI reads the folder is the thing the label cannot say twice.
  it("marks every folder with the agent that reads it", () => {
    render();
    expect(mark(option("Folder", "Claude Code"))).toBe("claude");
    expect(mark(option("Folder", "Claude Code, in this project"))).toBe("claude");
    expect(mark(option("Folder", "Codex"))).toBe("codex");
    expect(mark(option("Folder", "Codex, Gemini and OpenCode"))).toBe("shared");
  });

  it("carries the chosen folder's mark onto the collapsed agent line", () => {
    render();
    expect(mark(trigger("Who runs it"))).toBe("claude");
    expect(mark(option("Who runs it", "Only you"))).toBe("prompt");
    press(trigger("Who runs it"), "Escape");
    click(option("Folder", "Codex, Gemini and OpenCode"));
    expect(mark(trigger("Who runs it"))).toBe("shared");
  });

  it("keeps the opt-out when the folder moves to Codex", () => {
    render();
    click(option("Who runs it", "Only you"));
    click(option("Folder", "Codex, Gemini and OpenCode"));
    expect(trigger("Who runs it").textContent).toContain("Only you");
  });

  // Four folders cost one press of Tab, not four: the field is a single stop
  // and the arrows walk the open list from the trigger.
  it("opens and picks from the keyboard", () => {
    render();
    press(trigger("Folder"), "ArrowDown");
    expect(document.querySelector('[role="listbox"][aria-label="Folder"]')).not.toBeNull();
    press(trigger("Folder"), "ArrowDown");
    expect(highlighted("Folder")).toContain("Claude Code, in this project");
    press(trigger("Folder"), "Enter");
    expect(trigger("Folder").textContent).toContain("Claude Code, in this project");
    expect(document.querySelector('[role="listbox"]')).toBeNull();
  });

  // Opening lands on the answer already given, so the arrows start from it and
  // wrap rather than jumping to an end of the list.
  it("opens on the chosen folder and wraps at either end", () => {
    render();
    press(trigger("Folder"), "ArrowDown");
    expect(highlighted("Folder")).toContain("Claude Code");
    press(trigger("Folder"), "ArrowUp");
    expect(highlighted("Folder")).toContain("Codex, Gemini and OpenCode");
    press(trigger("Folder"), "ArrowDown");
    expect(highlighted("Folder")).toContain("Claude Code");
  });

  // Escape belongs to the open list; the dialog hosting it must not close too.
  it("closes on Escape without changing the answer", () => {
    render();
    press(trigger("Folder"), "ArrowDown");
    press(trigger("Folder"), "ArrowDown");
    press(trigger("Folder"), "Escape");
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    expect(trigger("Folder").textContent).toContain("Claude Code");
  });

  // Under a folder with no opt-out the agent option is the only enabled one, so
  // an arrow has nowhere to go — it must not land the choice on a disabled row.
  it("never arrows onto a disabled option", () => {
    render({ startDest: GEMINI.path, dests: [...DESTS, GEMINI] });
    expect(option("Who runs it", "Only you").disabled).toBe(true);
    press(trigger("Who runs it"), "ArrowDown");
    press(trigger("Who runs it"), "Enter");
    expect(trigger("Who runs it").textContent).toContain("Your agent");
  });

  // A re-scan can drop the chosen folder for a render before the fallback
  // re-picks; the collapsed line has to stay readable through that beat.
  it("falls back to the first folder while the chosen one is gone", () => {
    render({ startDest: "/gone" });
    expect(trigger("Folder").textContent).toContain("Claude Code");
  });
});
