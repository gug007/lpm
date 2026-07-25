// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ActionInputsEditor } from "./ActionInputsEditor";
import { newInputDraft, type InputDraft } from "./actionInputs";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
});

const button = (match: (el: HTMLButtonElement) => boolean) =>
  [...document.querySelectorAll("button")].find(match);

async function render(inputs: InputDraft[], cmd: string, onChange = vi.fn()) {
  const commandRef = { current: null };
  await act(async () => {
    root.render(
      <ActionInputsEditor
        inputs={inputs}
        cmd={cmd}
        commandRef={commandRef}
        onChange={onChange}
      />,
    );
  });
  return onChange;
}

describe("ActionInputsEditor", () => {
  it("picks a type from the menu", async () => {
    const inputs = [newInputDraft("bump", { label: "Bump", autoKey: true })];
    const onChange = await render(inputs, "./go.sh {{bump}}");

    await act(async () => {
      button((b) => b.getAttribute("aria-label") === "Answer type")!.click();
    });
    const choice = button((b) => b.textContent?.startsWith("Choice") ?? false);
    expect(choice, "menu renders its options").toBeTruthy();

    await act(async () => {
      choice!.click();
    });
    expect(onChange.mock.calls[0][0].inputs[0].type).toBe("radio");
    // A choice question needs choices, so it seeds them rather than saving an
    // unanswerable question.
    expect(onChange.mock.calls[0][0].inputs[0].options).toHaveLength(2);
  });

  it("lets a fresh choice get a display label", async () => {
    const inputs = [
      newInputDraft("env", {
        label: "Environment",
        type: "radio",
        autoKey: true,
        options: [{ id: "1", label: "", value: "prod" }],
      }),
    ];
    const onChange = await render(inputs, "./go.sh {{env}}");

    await act(async () => {
      button((b) => b.getAttribute("aria-label") === "Show settings")!.click();
    });
    const shownAs = document.querySelector<HTMLInputElement>(
      'input[placeholder="Shown as (optional)"]',
    );
    expect(shownAs, "label field renders for a value-only choice").toBeTruthy();

    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(shownAs, "Production");
      shownAs!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onChange.mock.calls.at(-1)![0].inputs[0].options[0]).toEqual({
      id: "1",
      label: "Production",
      value: "prod",
    });
  });

  it("removing a question strips its token from the command", async () => {
    const inputs = [newInputDraft("bump", { label: "Bump", autoKey: true })];
    const onChange = await render(inputs, "./go.sh {{bump}}");

    await act(async () => {
      button((b) => b.getAttribute("aria-label") === "Remove question")!.click();
    });
    expect(onChange.mock.calls[0][0]).toEqual({ cmd: "./go.sh", inputs: [] });
  });

  it("offers to re-add a question whose token was deleted", async () => {
    const inputs = [newInputDraft("bump", { label: "Bump", autoKey: true })];
    const onChange = await render(inputs, "./go.sh");

    expect(document.body.textContent).toContain("Not in the command");
    await act(async () => {
      button((b) => b.textContent === "Add it")!.click();
    });
    expect(onChange.mock.calls[0][0].cmd).toBe("./go.sh {{bump}}");
  });
});
