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

  describe("Display", () => {
    const render = async (content: string, onChange = vi.fn()) => {
      await act(async () => {
        root.render(<VisualConfigEditor content={content} onChange={onChange} onEditYaml={vi.fn()} />);
      });
      const card = [...container.querySelectorAll("button")].find((candidate) =>
        candidate.textContent?.includes("make ios"),
      );
      await act(async () => card?.click());
      const label = [...container.querySelectorAll("label")].find((candidate) =>
        candidate.textContent?.startsWith("Display"),
      );
      return { select: label!.querySelector("select")!, onChange };
    };

    const labels = (select: HTMLSelectElement) => [...select.options].map((option) => option.textContent);
    const pick = async (select: HTMLSelectElement, value: string) => {
      await act(async () => {
        select.value = value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });
    };

    it("shows the zone a button sits in as its own option", async () => {
      const { select } = await render("actions:\n  ios:\n    cmd: make ios\n    display: build\n");
      expect(select.value).toBe("build");
      expect(labels(select)).toEqual(["Header (default)", "Footer", "Zone “build”"]);
    });

    it("moves a zone button to the header when the header is picked", async () => {
      const { select, onChange } = await render("actions:\n  ios:\n    cmd: make ios\n    display: build\n");
      await pick(select, "");
      expect(onChange).toHaveBeenCalledOnce();
      expect(onChange.mock.calls[0][0]).not.toContain("display");
    });

    it("keeps the zone when something else changes", async () => {
      const { onChange } = await render("actions:\n  ios:\n    cmd: make ios\n    display: build\n");
      const label = [...container.querySelectorAll("label")].find((candidate) => candidate.textContent?.startsWith("Label"));
      const input = label!.querySelector("input")!;
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "iOS");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      expect(onChange.mock.calls[0][0]).toContain("display: build");
    });

    it("moves a zone button to the footer", async () => {
      const { select, onChange } = await render("actions:\n  ios:\n    cmd: make ios\n    display: build\n");
      await pick(select, "footer");
      expect(onChange.mock.calls[0][0]).toContain("display: footer");
    });

    it("offers a terminal's zone the same way", async () => {
      const { select } = await render("terminals:\n  ios:\n    cmd: make ios\n    display: build\n");
      expect(select.value).toBe("build");
      expect(labels(select)).toContain("Zone “build”");
    });

    it.each(["", "header", "button", "footer"])("adds no zone option for %j", async (display) => {
      const { select } = await render(`actions:\n  ios:\n    cmd: make ios\n    display: "${display}"\n`);
      expect(labels(select)).toEqual(["Header (default)", "Footer"]);
    });

    it("keeps the legacy menu option for a menu button", async () => {
      const { select } = await render("actions:\n  ios:\n    cmd: make ios\n    display: menu\n");
      expect(select.value).toBe("menu");
      expect(labels(select)).toEqual(["Header (default)", "Footer", "Menu (legacy)"]);
    });
  });
});
