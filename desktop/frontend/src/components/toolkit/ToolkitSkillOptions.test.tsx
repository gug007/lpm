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

// A folder whose CLI honours no opt-out, so the "Only you" card is disabled.
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

function cards(label: string): HTMLButtonElement[] {
  const group = document.querySelector(`[role="radiogroup"][aria-label="${label}"]`);
  return Array.from(group?.querySelectorAll("button") ?? []);
}

function card(label: string, title: string): HTMLButtonElement {
  const found = cards(label).find((b) => b.textContent?.startsWith(title));
  if (!found) throw new Error(`no ${label} card titled ${title}`);
  return found;
}

function mark(label: string, title: string): string | null {
  return card(label, title).querySelector("[data-mark]")?.getAttribute("data-mark") ?? null;
}

function click(button: HTMLButtonElement) {
  act(() => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function press(button: HTMLButtonElement, key: string) {
  act(() => {
    button.focus();
    button.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
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
  it("offers one card per folder, with the path it writes to", () => {
    render();
    expect(cards("Folder")).toHaveLength(4);
    expect(card("Folder", "Claude Code").textContent).toContain("/h/.claude/skills");
    expect(card("Folder", "Codex, Gemini and OpenCode").textContent).toContain(
      "/h/.agents/skills",
    );
  });

  it("says which folder does not exist yet", () => {
    render();
    expect(card("Folder", "Claude Code, in this project").textContent).toContain(
      "will be created",
    );
    expect(card("Folder", "Claude Code").textContent).not.toContain("will be created");
  });

  it("marks the chosen folder and moves on click", () => {
    render();
    expect(card("Folder", "Claude Code").getAttribute("aria-checked")).toBe("true");
    click(card("Folder", "Codex, Gemini and OpenCode"));
    expect(card("Folder", "Codex, Gemini and OpenCode").getAttribute("aria-checked")).toBe(
      "true",
    );
    expect(card("Folder", "Claude Code").getAttribute("aria-checked")).toBe("false");
  });

  it("defaults to the agent picking it up, and keeps it to you on request", () => {
    render();
    expect(card("Who runs it", "Your agent").getAttribute("aria-checked")).toBe("true");
    click(card("Who runs it", "Only you"));
    expect(card("Who runs it", "Only you").getAttribute("aria-checked")).toBe("true");
    expect(card("Who runs it", "Your agent").textContent).toContain("description matches");
  });

  // The two CLIs are typed differently — Claude takes /name, Codex $name — and
  // a card that names the wrong one teaches a keystroke that does nothing.
  it("names the thing the user types, in the chosen CLI's own form", () => {
    render();
    expect(card("Who runs it", "Only you").textContent).toContain("/deploy-web");
    click(card("Folder", "Codex"));
    expect(card("Who runs it", "Only you").textContent).toContain("$deploy-web");
  });

  it("offers the opt-out under a Codex folder too", () => {
    render({ startDest: "/h/.codex/skills" });
    const only = card("Who runs it", "Only you");
    expect(only.disabled).toBe(false);
    expect(only.textContent).toContain("agents never trigger it");
  });

  // The shared folder is three CLIs' and only Codex honours the opt-out, so the
  // card has to say so rather than promise the skill is held back everywhere.
  it("says who still picks it up in the shared folder", () => {
    render({ startDest: "/h/.agents/skills" });
    const note = card("Who runs it", "Only you").textContent ?? "";
    expect(note).toContain("only Codex holds it back");
    expect(note).toContain("Gemini and OpenCode");
  });

  // The label runs out of room in two columns long before the mark does, and
  // which CLI reads the folder is the thing the label cannot say twice.
  it("marks every folder with the agent that reads it", () => {
    render();
    expect(mark("Folder", "Claude Code")).toBe("claude");
    expect(mark("Folder", "Claude Code, in this project")).toBe("claude");
    expect(mark("Folder", "Codex")).toBe("codex");
    expect(mark("Folder", "Codex, Gemini and OpenCode")).toBe("shared");
  });

  it("carries the chosen folder's mark onto the agent card", () => {
    render();
    expect(mark("Who runs it", "Your agent")).toBe("claude");
    expect(mark("Who runs it", "Only you")).toBe("prompt");
    click(card("Folder", "Codex, Gemini and OpenCode"));
    expect(mark("Who runs it", "Your agent")).toBe("shared");
  });

  it("keeps the opt-out when the folder moves to Codex", () => {
    render();
    click(card("Who runs it", "Only you"));
    click(card("Folder", "Codex, Gemini and OpenCode"));
    expect(card("Who runs it", "Only you").getAttribute("aria-checked")).toBe("true");
  });

  // Four folders should cost one press of Tab, not four: the chosen card holds
  // the group's tab stop and the arrows move the choice, selecting as they go.
  it("keeps one tab stop per group and moves the choice with the arrows", () => {
    render();
    expect(cards("Folder").map((b) => b.tabIndex)).toEqual([0, -1, -1, -1]);
    press(card("Folder", "Claude Code"), "ArrowRight");
    expect(card("Folder", "Claude Code, in this project").getAttribute("aria-checked")).toBe(
      "true",
    );
    expect(cards("Folder").map((b) => b.tabIndex)).toEqual([-1, 0, -1, -1]);
  });

  it("wraps at either end of the group", () => {
    render();
    press(card("Folder", "Claude Code"), "ArrowUp");
    expect(card("Folder", "Codex, Gemini and OpenCode").getAttribute("aria-checked")).toBe(
      "true",
    );
    press(card("Folder", "Codex, Gemini and OpenCode"), "ArrowDown");
    expect(card("Folder", "Claude Code").getAttribute("aria-checked")).toBe("true");
  });

  // Under a folder with no opt-out the agent card is the only enabled radio, so
  // an arrow has nowhere to go — it must not land the choice on a disabled card.
  it("never arrows onto a disabled card", () => {
    render({ startDest: GEMINI.path, dests: [...DESTS, GEMINI] });
    expect(card("Who runs it", "Only you").disabled).toBe(true);
    press(card("Who runs it", "Your agent"), "ArrowRight");
    expect(card("Who runs it", "Your agent").getAttribute("aria-checked")).toBe("true");
  });

  // A re-scan can drop the chosen folder for a render before the fallback
  // re-picks; the group must keep a tab stop through that beat.
  it("keeps the folder group tabbable while the chosen folder is gone", () => {
    render({ startDest: "/gone" });
    expect(cards("Folder").map((b) => b.tabIndex)).toEqual([0, -1, -1, -1]);
  });
});
