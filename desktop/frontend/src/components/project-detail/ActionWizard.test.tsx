// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ActionInfo, ZoneInfo } from "../../types";

const findActionSource = vi.fn(async () => "project" as const);
const readActionPayload = vi.fn(async () => ({
  cmd: "echo hello-world",
  env: { FOO: "bar" },
}));
const replaceAction = vi.fn(async () => {});
const updatePlacementNote = vi.fn(async () => false);

vi.mock("../../actionConfig", () => ({
  appendActionToLayer: vi.fn(),
  findActionSource: (...args: unknown[]) => findActionSource(...(args as [])),
  mergeActionPayload: (base: Record<string, unknown> | null) => ({ ...(base ?? {}) }),
  moveAction: vi.fn(),
  readActionPayload: (...args: unknown[]) => readActionPayload(...(args as [])),
  replaceAction: (...args: unknown[]) => replaceAction(...(args as [])),
  replaceActionPayload: vi.fn(),
  updatePlacementNote: (...args: unknown[]) => updatePlacementNote(...(args as [])),
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

// InputComposer transitively initializes the Tauri window bridge at import
// time, which doesn't exist under vitest.
vi.mock("../InputComposer", () => ({
  InputComposer: () => <div data-testid="prompt-composer" />,
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

function setValue(el: HTMLTextAreaElement | HTMLInputElement, value: string) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function commandField() {
  return document.querySelector<HTMLTextAreaElement>(
    'textarea[placeholder="npm run dev"]',
  )!;
}

describe("ActionWizard questions", () => {
  beforeEach(() => {
    localStorage.setItem("lpm.actionWizard.mode", "form");
  });

  it("shows a saved question and the command it fills in", async () => {
    const editing = {
      name: "deploy",
      label: "Deploy",
      cmd: "./deploy.sh --env {{env}}",
      type: "once",
      inputs: [
        {
          key: "env",
          label: "Environment",
          type: "radio",
          required: true,
          placeholder: "",
          default: "staging",
          persist: true,
          options: [
            { label: "staging", value: "staging" },
            { label: "production", value: "production" },
          ],
        },
      ],
    } as unknown as ActionInfo;

    await render({ editing, existingActionKeys: ["deploy"] });

    expect(document.body.textContent).toContain("Before running, ask");
    expect(
      document.querySelector<HTMLInputElement>(
        'input[placeholder="What to ask for"]',
      )?.value,
    ).toBe("Environment");
    expect(document.body.textContent).toContain("{{env}}");
    // The "Runs" line resolves the token to the value the dialog starts on.
    expect(document.body.textContent).toContain("./deploy.sh --env ");
    expect(document.body.textContent).toContain("staging");
  });

  it("creates a question when a token is typed into the command", async () => {
    await render({ existingActionKeys: [] });

    await act(async () => {
      setValue(
        document.querySelector<HTMLInputElement>(
          'input[placeholder="Run tests"]',
        )!,
        "Deploy",
      );
    });
    await act(async () => {
      setValue(commandField(), "./deploy.sh --env {{env}}");
    });

    expect(document.body.textContent).toContain("Before running, ask");
    expect(document.body.textContent).toContain("{{env}}");
  });

  it("adds a token to the command when a question is added", async () => {
    await render({ existingActionKeys: [] });

    await act(async () => {
      setValue(
        document.querySelector<HTMLInputElement>(
          'input[placeholder="Run tests"]',
        )!,
        "Deploy",
      );
    });
    await act(async () => {
      setValue(commandField(), "./deploy.sh");
    });

    const add = [...document.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Ask for a value"),
    )!;
    await act(async () => {
      add.click();
    });

    expect(commandField().value).toBe("./deploy.sh {{value}}");
  });
});

describe("ActionWizard edit-mode editor seeding", () => {
  beforeEach(() => {
    localStorage.setItem("lpm.actionWizard.mode", "editor");
  });

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

describe("ActionWizard placement of a new action", () => {
  beforeEach(() => {
    localStorage.setItem("lpm.actionWizard.mode", "editor");
  });

  it("starts in the footer when opened from the footer", async () => {
    await render({ initialDisplay: "footer", nextPosition: 7, existingActionKeys: [] });
    const yaml = document.querySelector('[data-testid="editor-value"]')?.textContent ?? "";
    expect(yaml).toContain("display: footer");
    expect(yaml).toContain("position: 7");
  });

  it("starts in the header otherwise", async () => {
    await render({ existingActionKeys: [] });
    expect(document.querySelector('[data-testid="editor-value"]')?.textContent).toContain("display: header");
  });
});

describe("ActionWizard placement in a zone's layers", () => {
  const zones: ZoneInfo[] = [
    {
      name: "build",
      label: "Build",
      rows: 2,
      source: "project",
      layers: [
        { name: "web", label: "Web" },
        { name: "mobile", label: "Mobile" },
      ],
    },
  ];
  const editing = { ...makeEditing(), display: "build", layer: "web" } as ActionInfo;

  beforeEach(() => {
    localStorage.setItem("lpm.actionWizard.mode", "form");
  });

  const buttonNamed = (text: string) =>
    [...document.querySelectorAll("button")].find((button) => button.textContent?.trim() === text)!;

  async function click(text: string) {
    await act(async () => {
      buttonNamed(text).click();
    });
  }

  async function save() {
    await click("Save changes⌘↵");
    await act(async () => {
      await Promise.resolve();
    });
    expect(replaceAction).toHaveBeenCalledTimes(1);
    const [, key, patch] = replaceAction.mock.calls[0] as unknown as [string, string, { set: Record<string, unknown>; remove: string[] }];
    expect(key).toBe("deploy");
    return patch;
  }

  it("leaves display and layer alone when placement wasn't touched", async () => {
    await render({ editing, zones, existingActionKeys: ["deploy"] });
    expect(buttonNamed("Build › Web").getAttribute("aria-pressed")).toBe("true");

    const patch = await save();

    expect(patch.set).not.toHaveProperty("display");
    expect(patch.set).not.toHaveProperty("layer");
    expect(patch.remove).not.toContain("display");
    expect(patch.remove).not.toContain("layer");
  });

  it("writes the zone and the layer when another layer is picked", async () => {
    await render({ editing, zones, existingActionKeys: ["deploy"] });
    await click("Build › Mobile");

    const patch = await save();

    expect(patch.set).toMatchObject({ display: "build", layer: "mobile" });
    expect(patch.remove).not.toContain("layer");
  });

  it("removes the layer when the header is picked", async () => {
    await render({ editing, zones, existingActionKeys: ["deploy"] });
    await click("Header");

    const patch = await save();

    expect(patch.set.display).toBe("header");
    expect(patch.set).not.toHaveProperty("layer");
    expect(patch.remove).toContain("layer");
  });

  it("puts the zone and the layer into the project file's placement note", async () => {
    updatePlacementNote.mockResolvedValueOnce(true);
    await render({ editing, zones, existingActionKeys: ["deploy"] });
    await click("Build › Mobile");

    const patch = await save();

    expect(updatePlacementNote).toHaveBeenCalledWith("demo", "deploy", "build", "mobile");
    expect(patch.set).not.toHaveProperty("display");
    expect(patch.set).not.toHaveProperty("layer");
  });
});
