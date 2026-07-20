// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ActionInfo } from "../../types";

const findActionSource = vi.fn(async () => "project" as const);
const readActionPayload = vi.fn(async () => ({
  cmd: "echo hello-world",
  env: { FOO: "bar" },
}));

vi.mock("../../actionConfig", () => ({
  appendActionToLayer: vi.fn(),
  findActionSource: (...args: unknown[]) => findActionSource(...(args as [])),
  mergeActionPayload: (base: Record<string, unknown> | null) => ({ ...(base ?? {}) }),
  moveAction: vi.fn(),
  readActionPayload: (...args: unknown[]) => readActionPayload(...(args as [])),
  replaceAction: vi.fn(),
  replaceActionPayload: vi.fn(),
}));

vi.mock("../../monaco-setup", () => ({
  ACTION_MODEL_URI: "inmemory://lpm/action.yml",
}));

vi.mock("../MonacoEditor", () => ({
  MonacoEditor: ({ value }: { value: string }) => (
    <div data-testid="editor-value">{value}</div>
  ),
}));

vi.mock("./useProjectSuggestions", () => ({
  useProjectSuggestions: () => [],
}));

vi.mock("./AIActionModal", () => ({
  AIActionModal: () => null,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock("../../store/settings", () => ({
  useSettingsStore: () => ({}),
  getSettings: () => ({}),
}));

const { ActionWizard } = await import("./ActionWizard");

function makeEditing(name = "deploy"): ActionInfo {
  return {
    name,
    label: "Deploy",
    cmd: "echo hello-world",
    type: "terminal",
    children: [],
  } as unknown as ActionInfo;
}

const baseProps = {
  open: true,
  projectName: "demo",
  projectRoot: "/tmp/demo",
  isRemote: false,
  nextPosition: 1,
  actions: [],
  onClose: vi.fn(),
  onSaved: vi.fn(),
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.setItem("lpm.actionWizard.mode", "editor");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  vi.clearAllMocks();
});

async function render(props: Record<string, unknown>) {
  const merged = { ...baseProps, ...props } as ComponentProps<typeof ActionWizard>;
  await act(async () => {
    root.render(<ActionWizard {...merged} />);
  });
  await act(async () => {
    await Promise.resolve();
  });
}

describe("ActionWizard edit-mode editor seeding", () => {
  it("shows the action payload in the editor once the read resolves", async () => {
    const editing = makeEditing();
    await render({ editing, existingActionKeys: ["deploy"] });
    expect(document.body.textContent).toContain("echo hello-world");
  });

  it("keeps the editor populated when existingActionKeys gets a new identity", async () => {
    const editing = makeEditing();
    await render({ editing, existingActionKeys: ["deploy"] });
    expect(document.body.textContent).toContain("echo hello-world");

    await render({ editing, existingActionKeys: ["deploy"] });
    expect(document.body.textContent).toContain("echo hello-world");
    expect(document.body.textContent).not.toContain("Loading action");
  });

  it("keeps the resolved config layer after a background refresh", async () => {
    const editing = makeEditing();
    await render({ editing, existingActionKeys: ["deploy"] });
    expect(document.body.textContent).toContain("Saves to User config");

    await render({ editing, existingActionKeys: ["deploy"] });
    expect(document.body.textContent).toContain("Saves to User config");
    expect(document.body.textContent).not.toContain("Locating config");
  });
});
