// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { EMPTY_COMPOSER, type ComposerValue } from "../../composerValue";

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  run: vi.fn(),
  cancel: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

vi.mock("../../../bridge/commands", () => ({ GenerateAgentSkill: mocks.generate }));
vi.mock("../../../bridge/runtime", () => ({ EventsOn: () => () => {} }));
vi.mock("sonner", () => ({ toast: mocks.toast }));

vi.mock("../../hooks/useAIPicker", () => ({
  useAIPicker: () => ({
    aiCLIs: { claude: true },
    anyAvailable: true,
    selectedCLI: "claude",
    selectedModel: "",
    selectedEffort: "",
    selectedFast: false,
    cliLabel: "Claude",
    selectAI: vi.fn(),
    selectEffort: vi.fn(),
    selectFast: vi.fn(),
  }),
}));

vi.mock("../../hooks/useAIGeneration", () => ({
  useAIGeneration: () => ({ generating: false, run: mocks.run, cancel: mocks.cancel }),
  isCanceledError: () => false,
}));

vi.mock("../ui/AIPickerButton", () => ({
  AIPickerButton: ({ onGenerate }: { onGenerate: () => void }) => (
    <button type="button" data-testid="draft-run" onClick={onGenerate}>
      Draft
    </button>
  ),
}));

vi.mock("../InputComposer", () => ({
  InputComposer: ({
    defaultValue,
    onChange,
    footer,
  }: {
    defaultValue?: { text: string };
    onChange?: (value: ComposerValue) => void;
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

const { ToolkitAiDraft } = await import("./ToolkitAiDraft");

let host: HTMLDivElement;
let root: Root;

// The request lives in the create form, so the harness holds it the same way:
// putting the row away must not be what loses a half-written description.
function Harness() {
  const [request, setRequest] = useState<ComposerValue>(EMPTY_COMPOSER);
  return (
    <ToolkitAiDraft
      cwd="/p"
      nameHint=""
      request={request}
      onRequest={setRequest}
      onDraft={vi.fn()}
    />
  );
}

function render() {
  act(() => {
    root.render(<Harness />);
  });
}

function button(text: string): HTMLButtonElement {
  const found = [...document.querySelectorAll("button")].find((b) =>
    b.textContent?.includes(text),
  );
  if (!found) throw new Error(`no button ${text}`);
  return found as HTMLButtonElement;
}

function composer(): HTMLTextAreaElement | null {
  return document.querySelector("textarea");
}

function click(el: HTMLElement) {
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function type(el: HTMLTextAreaElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
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
  vi.clearAllMocks();
});

describe("ToolkitAiDraft", () => {
  it("starts as one row, with no composer to fill", () => {
    render();
    expect(composer()).toBeNull();
    expect(button("Describe it and let AI draft the fields")).toBeTruthy();
  });

  it("opens the composer when the row is pressed", () => {
    render();
    click(button("Describe it and let AI draft the fields"));
    expect(composer()).toBeTruthy();
    expect(document.body.textContent).toContain("Draft it with AI");
  });

  it("keeps what was described when the row is put away, and gives it back", () => {
    render();
    click(button("Describe it and let AI draft the fields"));
    const box = composer();
    if (!box) throw new Error("no composer");
    type(box, "deploy the site to staging");

    const away = document.querySelector<HTMLButtonElement>(
      '[aria-label="Put the AI drafter away"]',
    );
    if (!away) throw new Error("no collapse control");
    click(away);

    expect(composer()).toBeNull();
    expect(button("deploy the site to staging")).toBeTruthy();

    click(button("deploy the site to staging"));
    expect(composer()?.value).toBe("deploy the site to staging");
  });
});
