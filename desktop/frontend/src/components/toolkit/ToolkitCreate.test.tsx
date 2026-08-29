// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { CapabilityRoot } from "../../toolkit";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

vi.mock("../../../bridge/commands", () => ({
  CreateAgentSkill: mocks.create,
}));
vi.mock("sonner", () => ({ toast: mocks.toast }));

// The prose fields are the app's composer, which brings dictation, the rewrite
// actions and a contentEditable the tests would have to drive by hand. The
// stub keeps the one behaviour the form depends on: the value seeds on mount,
// so text the form writes itself only lands when it remounts the field.
vi.mock("../InputComposer", () => ({
  InputComposer: ({
    defaultValue,
    onChange,
    placeholder,
    footer,
  }: {
    defaultValue?: { text: string };
    onChange?: (value: { text: string; images: []; pending: boolean }) => void;
    footer?: ReactNode;
    placeholder?: string;
  }) => (
    <>
      <textarea
        defaultValue={defaultValue?.text ?? ""}
        placeholder={placeholder}
        onChange={(e) => onChange?.({ text: e.target.value, images: [], pending: false })}
      />
      {footer}
    </>
  ),
}));

// The real drafter drags in the composer and the AI hooks; the form only needs
// something that hands it a draft the way the drafter would.
vi.mock("./ToolkitAiDraft", () => ({
  ToolkitAiDraft: ({
    onDraft,
  }: {
    onDraft: (draft: { name: string; description: string; body: string }) => void;
  }) => (
    <button
      type="button"
      data-testid="ai-draft"
      onClick={() =>
        onDraft({
          name: "drafted-skill",
          description: "Drafted description",
          body: "1. Drafted step",
        })
      }
    >
      Draft it with AI
    </button>
  ),
}));

const { ToolkitCreate } = await import("./ToolkitCreate");

const ROOTS: CapabilityRoot[] = [
  { cli: "claude", scope: "user", kind: "skill", path: "/h/.claude/skills", exists: true },
  { cli: "codex", scope: "user", kind: "skill", path: "/h/.codex/skills", exists: true },
];

let host: HTMLDivElement;
let root: Root;

function render() {
  act(() => {
    root.render(
      <ToolkitCreate
        cwd="/p"
        roots={ROOTS}
        items={[]}
        truncated={false}
        cli="all"
        seedName=""
        open
        onBack={vi.fn()}
        onCreated={vi.fn()}
        onOpenExisting={vi.fn()}
      />,
    );
  });
}

function draftButton(): HTMLButtonElement {
  const found = document.querySelector<HTMLButtonElement>('[data-testid="ai-draft"]');
  if (!found) throw new Error("no draft button");
  return found;
}

function field(id: string): HTMLInputElement | HTMLTextAreaElement {
  const found = document.getElementById(id);
  if (!found) throw new Error(`no field ${id}`);
  return found as HTMLInputElement | HTMLTextAreaElement;
}

function prose(name: string): HTMLTextAreaElement {
  const found = document.querySelector<HTMLTextAreaElement>(`[data-field="${name}"] textarea`);
  if (!found) throw new Error(`no field ${name}`);
  return found;
}

function submitButton(): HTMLButtonElement {
  const found = [...document.querySelectorAll("button")].find((b) =>
    b.textContent?.startsWith("Create skill"),
  );
  if (!found) throw new Error("no create button");
  return found as HTMLButtonElement;
}

function click(button: HTMLButtonElement) {
  act(() => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

// React reads the value off the event target, and its change tracker ignores a
// value assigned through the element's own setter — so go through the prototype.
function type(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("ToolkitCreate", () => {
  // Describe-first is the primary path, so it cannot sit below the fields it
  // fills — in a 300px pane that put it under the fold.
  it("leads the form with the AI draft", () => {
    render();
    const order = Array.from(
      document.querySelectorAll('[data-testid="ai-draft"], #toolkit-skill-name'),
    );
    expect(order[0].getAttribute("data-testid")).toBe("ai-draft");
  });

  it("fills an empty form from a draft without fuss", () => {
    render();
    click(draftButton());
    expect(field("toolkit-skill-name").value).toBe("drafted-skill");
    expect(prose("description").value).toBe("Drafted description");
    expect(prose("instructions").value).toBe("1. Drafted step");
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  // A skill whose file says nothing is a name the agent can open and learn
  // nothing from, so Create waits for the instructions the way it waits for the
  // description.
  it("holds Create until the instructions say something", () => {
    render();
    type(field("toolkit-skill-name"), "deploy-web");
    type(prose("description"), "Ship the site. Use when asked to deploy.");
    expect(submitButton().disabled).toBe(true);
    type(prose("instructions"), "1. Build the site");
    expect(submitButton().disabled).toBe(false);
  });

  // The draft replaces typed prose without asking, so the replacement has to be
  // reversible: a written-out description is not something to retype.
  it("offers Undo when the draft replaces typed prose", () => {
    render();
    type(prose("description"), "My own words");
    click(draftButton());
    expect(prose("description").value).toBe("Drafted description");
    expect(mocks.toast).toHaveBeenCalledTimes(1);

    const options = mocks.toast.mock.calls[0][1] as { action: { onClick: () => void } };
    act(() => options.action.onClick());
    expect(prose("description").value).toBe("My own words");
    expect(field("toolkit-skill-name").value).toBe("");
    expect(prose("instructions").value).toBe("");
  });
});
