// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentCapability } from "../../toolkit";

const mocks = vi.hoisted(() => ({
  preview: vi.fn(),
  remove: vi.fn(),
  onCancel: vi.fn(),
  onDeleted: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("../../../bridge/commands", () => ({
  PreviewAgentSkillDelete: mocks.preview,
  DeleteAgentSkill: mocks.remove,
}));
vi.mock("sonner", () => ({
  toast: { success: mocks.success, error: mocks.error },
}));

const { ToolkitDeleteDialog } = await import("./ToolkitDeleteDialog");

const SKILL_PATH = "/h/.claude/skills/deploy/SKILL.md";

function cap(over: Partial<AgentCapability> = {}): AgentCapability {
  return {
    id: "claude:skill:user:deploy",
    kind: "skill",
    name: "deploy",
    cli: "claude",
    scope: "user",
    path: SKILL_PATH,
    description: "Ship it",
    detail: "",
    enabled: true,
    editable: true,
    shadowedBy: "",
    problem: "",
    blocking: false,
    bytes: 0,
    ...over,
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  mocks.remove.mockResolvedValue(undefined);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

async function renderDialog(siblingPaths: string[] = []) {
  await act(async () => {
    root.render(
      <ToolkitDeleteDialog
        cwd="/work/lpm"
        cap={cap()}
        siblingPaths={siblingPaths}
        open
        onCancel={mocks.onCancel}
        onDeleted={mocks.onDeleted}
      />,
    );
  });
}

function button(label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === label,
  );
  if (!found) throw new Error(`no ${label} button in the dialog`);
  return found;
}

describe("ToolkitDeleteDialog", () => {
  it("shows why a removal was refused and keeps Delete out of reach", async () => {
    const refusal = "Skills for this project live on a remote host. Remove it there.";
    mocks.preview.mockImplementation(async () => {
      throw refusal;
    });

    await renderDialog();

    expect(document.body.textContent).toContain(refusal);
    expect(document.body.textContent).not.toContain("moves to the Trash");
    expect(button("Delete").disabled).toBe(true);

    await act(async () => button("Delete").click());
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("deletes once and reports back", async () => {
    mocks.preview.mockResolvedValue({
      dir: "/h/.claude/skills/deploy",
      name: "deploy",
      files: 3,
      bytes: 4096,
      extras: ["references"],
      extraCount: 1,
      truncated: false,
    });

    await renderDialog(["~/.agents/skills/deploy"]);

    expect(document.body.textContent).toContain(
      "and 2 other files in its folder move to the Trash",
    );
    expect(document.body.textContent).toContain("Also going: references.");
    expect(document.body.textContent).toContain(
      "A copy with this name is also in ~/.agents/skills/deploy — that one stays.",
    );

    const del = button("Delete");
    expect(del.disabled).toBe(false);
    await act(async () => del.click());

    expect(mocks.remove).toHaveBeenCalledTimes(1);
    expect(mocks.remove).toHaveBeenCalledWith("/work/lpm", SKILL_PATH);
    expect(mocks.success).toHaveBeenCalledWith("Moved deploy to the Trash");
    expect(mocks.onDeleted).toHaveBeenCalledOnce();
  });

  it("never counts files it did not finish counting", async () => {
    mocks.preview.mockResolvedValue({
      dir: "/h/.claude/skills/deploy",
      name: "deploy",
      files: 1,
      bytes: 12,
      extras: ["references"],
      extraCount: 1,
      truncated: true,
    });

    await renderDialog();

    expect(document.body.textContent).toContain("and everything in its folder moves");
    expect(document.body.textContent).not.toContain("0 other files");
  });

  it("says how many others there are, not how many it could name", async () => {
    mocks.preview.mockResolvedValue({
      dir: "/h/.claude/skills/deploy",
      name: "deploy",
      files: 21,
      bytes: 4096,
      extras: ["a", "b", "c", "d", "e", "f", "g", "h"],
      extraCount: 20,
      truncated: false,
    });

    await renderDialog();

    expect(document.body.textContent).toContain("Also going: a, b, c, d, and 16 more.");
  });
});
