// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const saved = vi.hoisted(() => ({ texts: {} as Record<string, string> }));

vi.mock("../../bridge/commands", () =>
  new Proxy(
    {
      ReadProjectInstructions: (_project: string, key: string) =>
        Promise.resolve(saved.texts[key] ?? ""),
    },
    {
      has: () => true,
      get: (target: Record<string, unknown>, prop) =>
        prop === "then" ? undefined : (target[prop as string] ?? vi.fn(() => Promise.resolve(""))),
    },
  ),
);

vi.mock("../../bridge/runtime", () => ({ EventsOn: () => () => {} }));

import { ProjectAIInstructions } from "./ProjectAIInstructions";
import { instructionState } from "./useProjectInstructionStates";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  saved.texts = {};
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function render() {
  await act(async () => {
    root.render(<ProjectAIInstructions projectName="saas-app" back={{ label: "saas-app", onClick: () => {} }} />);
  });
}

const chip = (el: HTMLElement) =>
  [...el.querySelectorAll("span")].some((s) => s.textContent === "Custom");

function row(label: string): HTMLElement {
  const title = [...container.querySelectorAll("p")].find((p) => p.textContent === label);
  return title!.closest(".justify-between") as HTMLElement;
}

describe("instructionState", () => {
  it("is custom once any text has a non-blank line", () => {
    expect(instructionState(["", "\n  \n  Keep titles short\nUse the ticket id"])).toEqual({
      custom: true,
      text: "Keep titles short\nUse the ticket id",
    });
  });

  it("treats blank and whitespace-only texts as the defaults", () => {
    expect(instructionState(["", "  \n\t"])).toEqual({ custom: false });
  });
});

describe("ProjectAIInstructions", () => {
  it("marks a customized row and previews its lines", async () => {
    saved.texts.commit = "Conventional commits.\nMention the ticket.";
    await render();

    const commit = row("Commit instructions");
    expect(chip(commit)).toBe(true);
    expect(commit.textContent).toContain("Conventional commits.");
    expect(commit.textContent).toContain("Mention the ticket.");
    expect(commit.querySelector("button")!.textContent).toBe("Edit");
  });

  it("labels rows that use the global default, previews it and offers to customize them", async () => {
    saved.texts.commit = "Conventional commits.";
    await render();

    const branch = row("Branch name instructions");
    expect(branch.textContent).toContain("Global default");
    expect(branch.textContent).toContain("Use kebab-case");
    expect(chip(branch)).toBe(false);
    expect(branch.querySelector("button")!.textContent).toBe("Customize");
  });

  it("counts the pull request row as custom when only the description is set", async () => {
    saved.texts["pr-description"] = "List the migrations.";
    await render();

    expect(row("PR instructions").textContent).toContain("List the migrations.");
  });
});
