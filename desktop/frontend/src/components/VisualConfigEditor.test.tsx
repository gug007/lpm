// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VisualConfigEditor } from "./VisualConfigEditor";

vi.mock("../store/accounts", () => ({
  useAccountsStore: (
    selector: (state: {
      accounts: never[];
      statuses: Record<string, never>;
    }) => unknown,
  ) => selector({ accounts: [], statuses: {} }),
}));

vi.mock("../store/app", () => ({
  useAppStore: (
    selector: (state: {
      setView: () => void;
      setSettingsTab: () => void;
    }) => unknown,
  ) => selector({ setView: vi.fn(), setSettingsTab: vi.fn() }),
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("VisualConfigEditor", () => {
  it("keeps malformed YAML recoverable in source view", async () => {
    const onChange = vi.fn();
    const onEditYaml = vi.fn();
    const content = `actions:
  review-worktree:
    cmd: claude "PR links to review: {{prs}}. Follow the instructions."
`;

    await act(async () => {
      root.render(
        <VisualConfigEditor
          content={content}
          onChange={onChange}
          onEditYaml={onEditYaml}
        />,
      );
    });

    expect(container.textContent).toContain("Form view is unavailable");
    expect(container.textContent).toContain(
      "Nested mappings are not allowed in compact mappings",
    );

    const button = [...container.querySelectorAll("button")].find((candidate) =>
      candidate.textContent?.includes("Edit YAML source"),
    );
    expect(button).toBeDefined();

    await act(async () => button?.click());

    expect(onEditYaml).toHaveBeenCalledOnce();
    expect(onChange).not.toHaveBeenCalled();
  });
});
