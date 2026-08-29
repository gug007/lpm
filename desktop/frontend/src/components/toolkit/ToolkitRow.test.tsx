// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentCapability } from "../../toolkit";
import { ToolkitRow } from "./ToolkitRow";

const onEdit = vi.fn();
const onActivate = vi.fn();
const onSelect = vi.fn();

function cap(over: Partial<AgentCapability> = {}): AgentCapability {
  return {
    id: "claude:skill:user:deploy",
    kind: "skill",
    name: "deploy",
    cli: "claude",
    scope: "user",
    path: "/h/.claude/skills/deploy/SKILL.md",
    description: "Ship it",
    detail: "",
    enabled: true,
    editable: true,
    shadowedBy: "",
    problem: "",
    blocking: false,
    bytes: 120,
    ...over,
  };
}

let host: HTMLDivElement;
let root: Root;

async function render({ active = true, editable = true } = {}) {
  await act(async () => {
    root.render(
      <ToolkitRow
        cap={cap()}
        summary="Ship it"
        active={active}
        fault={false}
        nested={false}
        showCli={false}
        onEdit={editable ? onEdit : undefined}
        onSelect={onSelect}
        onActivate={onActivate}
      />,
    );
  });
}

const pencil = () => document.querySelector<HTMLButtonElement>('[aria-label="Edit deploy"]');

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("ToolkitRow", () => {
  // An invisible button in every row's gutter would swallow clicks meant for
  // the row, so the pencil exists only where it can be seen.
  it("shows the pencil on the row you are on, and nowhere else", async () => {
    await render({ active: false });
    expect(pencil()).toBeNull();

    await render({ active: true });
    expect(pencil()).not.toBeNull();
  });

  it("leaves a row lpm cannot write without one", async () => {
    await render({ editable: false });
    expect(pencil()).toBeNull();
  });

  // The pencil sits over the row rather than inside it: a click on it must not
  // also open the doc underneath.
  it("edits without opening the row", async () => {
    await render();
    act(() => {
      pencil()!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onEdit).toHaveBeenCalledOnce();
    expect(onActivate).not.toHaveBeenCalled();
  });
});
