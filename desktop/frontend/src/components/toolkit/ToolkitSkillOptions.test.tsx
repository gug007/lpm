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
  {
    path: "/h/.agents/skills",
    cli: "codex",
    scope: "user",
    label: "Codex, Gemini and OpenCode",
    exists: true,
  },
];

// The parent owns both choices the way ToolkitCreate does, including the rule
// that moving to a Codex folder gives the opt-out back up.
function Harness({ startDest = DESTS[0].path }: { startDest?: string }) {
  const [destPath, setDestPath] = useState(startDest);
  const [manual, setManual] = useState(false);
  const dest = DESTS.find((d) => d.path === destPath) ?? null;
  const manualAllowed = dest?.cli === "claude";
  return (
    <ToolkitSkillOptions
      destinations={DESTS}
      destPath={destPath}
      onDest={setDestPath}
      manual={manual && manualAllowed}
      manualAllowed={manualAllowed}
      onManual={setManual}
      slash="/deploy-web"
    />
  );
}

let host: HTMLDivElement;
let root: Root;

function render(props: { startDest?: string } = {}) {
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

function click(button: HTMLButtonElement) {
  act(() => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
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
    expect(cards("Folder")).toHaveLength(3);
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

  it("names the slash command that runs it", () => {
    render();
    expect(card("Who runs it", "Only you").textContent).toContain("/deploy-web");
  });

  it("keeps the opt-out visible under a Codex folder, and says why it is off", () => {
    render({ startDest: DESTS[2].path });
    const only = card("Who runs it", "Only you");
    expect(only.disabled).toBe(true);
    expect(only.textContent).toContain("Only Claude Code skills can be kept from the agent.");
  });

  it("gives the opt-out back up when the folder moves to Codex", () => {
    render();
    click(card("Who runs it", "Only you"));
    expect(card("Who runs it", "Only you").getAttribute("aria-checked")).toBe("true");
    click(card("Folder", "Codex, Gemini and OpenCode"));
    expect(card("Who runs it", "Only you").getAttribute("aria-checked")).toBe("false");
    expect(card("Who runs it", "Your agent").getAttribute("aria-checked")).toBe("true");
  });
});
