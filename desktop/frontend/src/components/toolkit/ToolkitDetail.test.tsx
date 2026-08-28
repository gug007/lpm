// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentCapability } from "../../toolkit";

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  update: vi.fn(),
  write: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  onSaved: vi.fn(),
  onBack: vi.fn(),
  onDeleted: vi.fn(),
}));

vi.mock("../../../bridge/commands", () => ({
  ReadAgentCapability: mocks.read,
  UpdateAgentSkill: mocks.update,
  WriteAgentCapability: mocks.write,
  PreviewAgentSkillDelete: vi.fn(),
  DeleteAgentSkill: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));

// The doc pane's own dependencies — a syntax highlighter and the open-in list —
// have nothing to do with the form under test and cost a second to load.
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

async function render(over: Partial<AgentCapability> = {}, deletable = true) {
  await act(async () => {
    root.render(
      <ToolkitDetail
        cap={cap(over)}
        cwd="/work/lpm"
        siblingPaths={[]}
        deletable={deletable}
        active
        onBack={mocks.onBack}
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

function button(label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === label,
  );
  if (!found) throw new Error(`no ${label} button in the detail view`);
  return found;
}

function card(title: string): HTMLButtonElement {
  const group = document.querySelector('[role="radiogroup"][aria-label="Who runs it"]');
  const found = [...(group?.querySelectorAll("button") ?? [])].find((b) =>
    b.textContent?.startsWith(title),
  );
  if (!found) throw new Error(`no card titled ${title}`);
  return found;
}

function textarea(): HTMLTextAreaElement {
  const found = document.getElementById("toolkit-skill-edit-description");
  if (!found) throw new Error("no description field");
  return found as HTMLTextAreaElement;
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

async function openForm() {
  await render();
  click(tab("Edit")!);
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

describe("ToolkitDetail edit mode", () => {
  // The form writes to a skill folder, which is only lpm's to write when the
  // capability is a local skill lpm owns the format of.
  it("offers the form for your own skill and nothing else", async () => {
    await render();
    expect(tab("Edit")).not.toBeNull();

    await render({ kind: "command", name: "deploy", path: "/h/.claude/commands/deploy.md" });
    expect(tab("Edit")).toBeNull();

    await render({}, false);
    expect(tab("Edit")).toBeNull();
  });

  it("starts from what the file already says", async () => {
    await openForm();
    expect(textarea().value).toBe("Ship it");
    expect(card("Your agent").getAttribute("aria-checked")).toBe("true");
  });

  it("has nothing to save until something changes", async () => {
    await openForm();
    expect(button("Save changes").disabled).toBe(true);
    type(textarea(), "Ship the site");
    expect(button("Save changes").disabled).toBe(false);
  });

  // Both CLIs drop a skill whose description carries an angle bracket, so the
  // form has to stop it here rather than let it be written and silently ignored.
  it("refuses a description the CLIs would drop, and says which characters", async () => {
    await openForm();
    type(textarea(), "Ship the <site>");
    expect(button("Save changes").disabled).toBe(true);
    expect(document.body.textContent).toContain("Skip the < and > characters here.");
  });

  it("saves both answers at once and goes back to the doc", async () => {
    await openForm();
    type(textarea(), "  Ship the site  ");
    click(card("Only you"));

    await act(async () => button("Save changes").click());

    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledWith(
      "/work/lpm",
      SKILL_PATH,
      SKILL,
      "Ship the site",
      true,
    );
    expect(mocks.success).toHaveBeenCalledWith("Saved");
    expect(mocks.onSaved).toHaveBeenCalledOnce();
    expect(tab("Doc")?.getAttribute("aria-pressed")).toBe("true");
  });

  // Someone else wrote to the file while the form was open, so the form has to
  // give way to what is on disk rather than write over it.
  it("reloads instead of clobbering a file that moved under it", async () => {
    mocks.update.mockRejectedValueOnce("modified");
    mocks.read
      .mockResolvedValueOnce(doc(SKILL))
      .mockResolvedValue(doc(SKILL.replace("Ship it", "Ship it, from the agent")));
    await openForm();
    type(textarea(), "Ship the site");

    await act(async () => button("Save changes").click());

    expect(mocks.error).toHaveBeenCalledWith("Changed on disk since you opened it — reloading.");
    expect(mocks.onSaved).not.toHaveBeenCalled();
    expect(textarea().value).toBe("Ship it, from the agent");
  });

  // Leaving the form is leaving it: coming back must show the file, not a draft
  // the user walked away from.
  it("throws the form away on cancel", async () => {
    await openForm();
    type(textarea(), "Ship the site");
    click(button("Cancel"));
    expect(tab("Doc")?.getAttribute("aria-pressed")).toBe("true");

    click(tab("Edit")!);
    expect(textarea().value).toBe("Ship it");
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
