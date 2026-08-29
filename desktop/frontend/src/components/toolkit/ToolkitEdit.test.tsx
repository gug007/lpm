// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { AgentCapability } from "../../toolkit";

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  update: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  onSaved: vi.fn(),
  onBack: vi.fn(),
}));

vi.mock("../../../bridge/commands", () => ({
  ReadAgentCapability: mocks.read,
  UpdateAgentSkill: mocks.update,
}));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));

// The prose fields are the app's composer, which brings dictation, the rewrite
// actions and a contentEditable the tests would have to drive by hand. The stub
// keeps the one behaviour the form depends on: the value seeds on mount, so
// what the file says only reaches a field when the form remounts it.
vi.mock("../InputComposer", () => ({
  InputComposer: ({
    defaultValue,
    onChange,
    footer,
  }: {
    defaultValue?: { text: string };
    onChange?: (value: { text: string; images: []; pending: boolean }) => void;
    footer?: ReactNode;
  }) => (
    <>
      <textarea
        defaultValue={defaultValue?.text ?? ""}
        onChange={(e) => onChange?.({ text: e.target.value, images: [], pending: false })}
      />
      {footer}
    </>
  ),
}));

const { ToolkitEdit } = await import("./ToolkitEdit");

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

async function render(over: Partial<AgentCapability> = {}) {
  await act(async () => {
    root.render(
      <ToolkitEdit
        cwd="/work/lpm"
        cap={cap(over)}
        open
        onBack={mocks.onBack}
        onSaved={mocks.onSaved}
      />,
    );
  });
}

function prose(name: string): HTMLTextAreaElement {
  const found = document.querySelector<HTMLTextAreaElement>(`[data-field="${name}"] textarea`);
  if (!found) throw new Error(`no field ${name}`);
  return found;
}

function button(label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll("button")].find((b) =>
    b.textContent?.trim().startsWith(label),
  );
  if (!found) throw new Error(`no ${label} button`);
  return found;
}

// The collapsed "Who runs it" line, and the options behind it.
function runMode(): HTMLButtonElement {
  const found = document.querySelector<HTMLButtonElement>('[role="combobox"]');
  if (!found) throw new Error("no Who runs it field");
  return found;
}

function runOption(title: string): HTMLButtonElement {
  if (runMode().getAttribute("aria-expanded") !== "true") click(runMode());
  const list = document.querySelector('[role="listbox"][aria-label="Who runs it"]');
  const found = [...(list?.querySelectorAll("button") ?? [])].find((b) =>
    b.textContent?.startsWith(title),
  );
  if (!found) throw new Error(`no option titled ${title}`);
  return found;
}

function click(target: HTMLButtonElement) {
  act(() => {
    target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
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
  mocks.update.mockResolvedValue(undefined);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("ToolkitEdit", () => {
  // The heading lpm writes from the name is not instructions, so it rides
  // outside the field the way the create form leaves it out.
  it("starts from what the file already says", async () => {
    await render();
    expect(prose("description").value).toBe("Ship it");
    expect(prose("instructions").value).toBe("Run it.");
    expect(runMode().textContent).toContain("Your agent");
    expect(document.body.textContent).toContain("deploy");
  });

  it("has nothing to save until something changes", async () => {
    await render();
    expect(button("Save changes").disabled).toBe(true);
    type(prose("description"), "Ship the site");
    expect(button("Save changes").disabled).toBe(false);
  });

  // Both CLIs drop a skill whose description carries an angle bracket, so the
  // form has to stop it here rather than let it be written and silently ignored.
  it("refuses a description the CLIs would drop, and says which characters", async () => {
    await render();
    type(prose("description"), "Ship the <site>");
    expect(button("Save changes").disabled).toBe(true);
    expect(document.body.textContent).toContain("Skip the < and > characters here.");
  });

  // A body nobody opened this to change is never rewritten: the save carries no
  // prose at all, so the file's own comes back byte for byte.
  it("saves the description and who runs it without touching the body", async () => {
    await render();
    type(prose("description"), "  Ship the site  ");
    click(runOption("Only you"));

    await act(async () => button("Save changes").click());

    expect(mocks.update).toHaveBeenCalledWith(
      "/work/lpm",
      SKILL_PATH,
      SKILL,
      "Ship the site",
      true,
      null,
    );
    expect(mocks.success).toHaveBeenCalledWith("Saved");
    expect(mocks.onSaved).toHaveBeenCalledOnce();
    expect(mocks.onBack).toHaveBeenCalledOnce();
  });

  it("puts the heading back on top of rewritten instructions", async () => {
    await render();
    type(prose("instructions"), "1. Build\n2. Ship");

    await act(async () => button("Save changes").click());

    expect(mocks.update).toHaveBeenCalledWith(
      "/work/lpm",
      SKILL_PATH,
      SKILL,
      "Ship it",
      false,
      "# Deploy\n\n1. Build\n2. Ship",
    );
  });

  // An instructions field emptied out is a skill the agent can open and learn
  // nothing from.
  it("holds the save when the instructions are emptied", async () => {
    await render();
    type(prose("instructions"), "  ");
    expect(button("Save changes").disabled).toBe(true);
    expect(document.body.textContent).toContain("Say what the agent should do once it opens this.");
  });

  // Someone else wrote to the file while the form was open, so the form has to
  // give way to what is on disk rather than write over it.
  it("reloads instead of clobbering a file that moved under it", async () => {
    mocks.update.mockRejectedValueOnce("modified");
    mocks.read
      .mockResolvedValueOnce(doc(SKILL))
      .mockResolvedValue(doc(SKILL.replace("Ship it", "Ship it, from the agent")));
    await render();
    type(prose("description"), "Ship the site");

    await act(async () => button("Save changes").click());

    expect(mocks.error).toHaveBeenCalledWith("Changed on disk since you opened it — reloading.");
    expect(mocks.onSaved).not.toHaveBeenCalled();
    expect(mocks.onBack).not.toHaveBeenCalled();
    expect(prose("description").value).toBe("Ship it, from the agent");
  });

  // A skill in the folder Codex shares with Gemini and OpenCode: only Codex
  // honours the opt-out, so the wording under the option says so.
  it("reads the run mode from the folder the skill sits in", async () => {
    await render({ cli: "codex", path: "/h/.agents/skills/deploy/SKILL.md" });
    click(runMode());
    expect(runOption("Only you").textContent).toContain("$deploy");
    expect(runOption("Only you").textContent).toContain("Gemini and OpenCode");
  });
});
