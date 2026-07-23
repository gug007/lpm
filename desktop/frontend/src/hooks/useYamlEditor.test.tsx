// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validateYaml } from "../yamlValidation";
import { useYamlEditor } from "./useYamlEditor";

vi.mock("./useKeyboardShortcut", () => ({
  useKeyboardShortcut: vi.fn(),
}));

const validYaml = "name: demo\n";
const invalidYaml = `actions:
  review:
    cmd: claude "PR links to review: {{prs}}"
`;
const load = vi.fn(async () => validYaml);

function EditorHarness({
  save,
}: {
  save: (content: string) => Promise<void>;
}) {
  const editor = useYamlEditor(load, save, validateYaml);

  return (
    <div>
      <button onClick={() => editor.setContent(invalidYaml)}>Break YAML</button>
      <button onClick={() => editor.setContent("name: fixed\n")}>Fix YAML</button>
      <button onClick={() => void editor.handleSave()}>Save</button>
      <span>{editor.validationError}</span>
    </div>
  );
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

function button(label: string): HTMLButtonElement {
  const match = [...container.querySelectorAll("button")].find(
    (candidate) => candidate.textContent === label,
  );
  if (!match) throw new Error(`${label} button not found`);
  return match;
}

describe("useYamlEditor", () => {
  it("rejects malformed YAML before calling the save command", async () => {
    const save = vi.fn(async () => undefined);

    await act(async () => {
      root.render(<EditorHarness save={save} />);
      await Promise.resolve();
    });

    await act(async () => button("Break YAML").click());

    expect(container.textContent).toContain(
      "Nested mappings are not allowed in compact mappings",
    );

    await act(async () => button("Save").click());

    expect(save).not.toHaveBeenCalled();

    await act(async () => button("Fix YAML").click());
    await act(async () => button("Save").click());

    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith("name: fixed\n");
  });
});
