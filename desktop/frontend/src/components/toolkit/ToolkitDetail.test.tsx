// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentCapability } from "../../toolkit";

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  write: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  onSaved: vi.fn(),
  onBack: vi.fn(),
  onEdit: vi.fn(),
  onDeleted: vi.fn(),
}));

vi.mock("../../../bridge/commands", () => ({
  ReadAgentCapability: mocks.read,
  WriteAgentCapability: mocks.write,
  PreviewAgentSkillDelete: vi.fn(),
  DeleteAgentSkill: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));

// The doc pane's own dependencies — a syntax highlighter and the open-in list —
// have nothing to do with what is under test and cost a second to load.
vi.mock("../MessageMarkdown", () => ({
  MessageMarkdown: ({ text }: { text: string }) => <p>{text}</p>,
}));
vi.mock("../OpenFileWithDropdown", () => ({ OpenFileWithDropdown: () => null }));

const { ToolkitDetail } = await import("./ToolkitDetail");

const SKILL_PATH = "/h/.claude/skills/deploy/SKILL.md";
const SKILL = '---\nname: "deploy"\ndescription: "Ship it"\n---\n\n# Deploy\n\nRun it.\n';

function doc(content: string) {
  return { path: SKILL_PATH, content, editable: true, truncated: false };
}

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
    bytes: 120,
    ...over,
  };
}

let host: HTMLDivElement;
let root: Root;

async function render(over: Partial<AgentCapability> = {}, deletable = true, savedAt = 0) {
  await act(async () => {
    root.render(
      <ToolkitDetail
        cap={cap(over)}
        cwd="/work/lpm"
        siblingPaths={[]}
        deletable={deletable}
        savedAt={savedAt}
        active
        onBack={mocks.onBack}
        onEdit={mocks.onEdit}
        onSaved={mocks.onSaved}
        onDeleted={mocks.onDeleted}
      />,
    );
  });
}

function tab(label: string): HTMLButtonElement | null {
  const group = document.querySelector('[role="group"][aria-label="Capability view"]');
  return (
    [...(group?.querySelectorAll("button") ?? [])].find((b) => b.textContent?.trim() === label) ??
    null
  );
}

function pencil(): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>('[aria-label="Edit this skill"]');
}

function click(target: HTMLButtonElement) {
  act(() => {
    target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function source(): HTMLTextAreaElement {
  const found = document.querySelector("textarea");
  if (!found) throw new Error("no source editor");
  return found;
}

// React reads the value off the event target, and its change tracker ignores a
// value assigned through the element's own setter — so go through the prototype.
function type(el: HTMLTextAreaElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  mocks.read.mockResolvedValue(doc(SKILL));
  mocks.write.mockResolvedValue(undefined);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("ToolkitDetail", () => {
  // The form writes to a skill folder, which is only lpm's to write when the
  // capability is a local skill lpm owns the format of.
  it("offers the form for your own skill and nothing else", async () => {
    await render();
    expect(pencil()).not.toBeNull();

    await render({ kind: "command", name: "deploy", path: "/h/.claude/commands/deploy.md" });
    expect(pencil()).toBeNull();

    await render({}, false);
    expect(pencil()).toBeNull();
  });

  // The same form the list's pencil opens: the detail asks the pane for it
  // rather than keeping a second one of its own.
  it("hands the form back to the pane", async () => {
    await render();
    click(pencil()!);
    expect(mocks.onEdit).toHaveBeenCalledOnce();
  });

  it("reads the file and its source, and offers no form of its own", async () => {
    await render();
    expect(tab("Doc")).not.toBeNull();
    expect(tab("Source")).not.toBeNull();
    expect(tab("Edit")).toBeNull();
  });

  // The source editor and the form write the same file, so one may not be
  // opened over what the other is holding.
  it("holds the form while the source has unsaved text", async () => {
    await render();
    click(tab("Source")!);
    type(source(), `${SKILL}\nAnd more.\n`);
    expect(pencil()?.disabled).toBe(true);
  });

  // The form wrote to the file behind this, so what is on screen is a version
  // behind until it reads it again.
  it("re-reads the file after the form saves", async () => {
    await render();
    expect(document.body.textContent).toContain("Run it.");

    mocks.read.mockResolvedValue(doc(SKILL.replace("Run it.", "Run it twice.")));
    await render({}, true, 1);

    expect(mocks.read).toHaveBeenCalledTimes(2);
    expect(document.body.textContent).toContain("Run it twice.");
  });
});
