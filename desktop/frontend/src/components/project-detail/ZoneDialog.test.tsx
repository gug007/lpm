// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dnd = vi.hoisted(() => ({
  onDragStart: undefined as (() => void) | undefined,
  onDragCancel: undefined as (() => void) | undefined,
}));
vi.mock("@dnd-kit/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dnd-kit/core")>();
  return {
    ...actual,
    DndContext: ({
      onDragStart,
      onDragCancel,
      children,
    }: {
      onDragStart?: () => void;
      onDragCancel?: () => void;
      children: ReactNode;
    }) => {
      dnd.onDragStart = onDragStart;
      dnd.onDragCancel = onDragCancel;
      return <>{children}</>;
    },
  };
});

import { ZoneDialog } from "./ZoneDialog";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const button = (text: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);
const nameField = () => document.querySelector<HTMLInputElement>('[role="dialog"] input')!;

const field = (label: string) => document.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;

function setValue(el: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function open(props: Partial<Parameters<typeof ZoneDialog>[0]> = {}) {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  act(() =>
    root.render(
      <ZoneDialog
        mode="create"
        row="footer"
        placeholder="Optional"
        initial={{ label: "", rows: 1 }}
        onCancel={onCancel}
        onSubmit={onSubmit}
        {...props}
      />,
    ),
  );
  return { onSubmit, onCancel };
}

describe("ZoneDialog", () => {
  it("creates a zone with a name and a height", () => {
    const { onSubmit } = open();
    expect(document.body.textContent).toContain("Create zone");
    expect(document.body.textContent).toContain("at the end of the footer row");
    act(() => setValue(nameField(), "  Deploy "));
    act(() => button("3 rows")!.click());
    act(() => button("Create")!.click());
    expect(onSubmit).toHaveBeenCalledWith({ label: "Deploy", rows: 3 }, []);
  });

  it("submits from the keyboard", () => {
    const { onSubmit } = open();
    act(() => {
      document.querySelector('[role="dialog"] form')!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(onSubmit).toHaveBeenCalledWith({ label: "", rows: 1 }, []);
  });

  it("opens an edit with the zone's name and height", () => {
    const { onSubmit } = open({
      mode: "edit",
      row: "header",
      placeholder: "build",
      initial: { label: "Build", rows: 2, layers: [] },
    });
    expect(document.body.textContent).toContain("Edit zone");
    expect(nameField().value).toBe("Build");
    expect(nameField().placeholder).toBe("build");
    expect(button("2 rows")?.getAttribute("aria-pressed")).toBe("true");
    act(() => button("1 row")!.click());
    act(() => button("Save")!.click());
    expect(onSubmit).toHaveBeenCalledWith({ label: "Build", rows: 1 }, []);
  });

  it("has no Layers section when creating a zone", () => {
    open();
    expect(button("Add layer")).toBeUndefined();
  });

  it("edits the zone's layers", () => {
    const { onSubmit } = open({
      mode: "edit",
      row: "header",
      placeholder: "build",
      initial: { label: "Build", rows: 1, layers: [{ key: "dev", label: "Dev" }, { key: "ops", label: "" }] },
    });
    expect(document.body.textContent).toContain("Layers");
    act(() => setValue(field("Layer 2 name"), " Ops "));
    act(() => button("Add layer")!.click());
    act(() => setValue(field("Layer 3 name"), "QA"));
    act(() => document.querySelector<HTMLButtonElement>('[aria-label="Remove layer 1"]')!.click());
    act(() => button("Save")!.click());
    expect(onSubmit).toHaveBeenCalledWith({ label: "Build", rows: 1 }, [{ key: "ops", label: "Ops" }, { label: "QA" }]);
  });

  it("adds the first layers to a zone without any", () => {
    const { onSubmit } = open({ mode: "edit", initial: { label: "Build", rows: 1, layers: [] } });
    act(() => button("Add layer")!.click());
    expect(field("Layer 1 name").placeholder).toBe("Layer 1");
    expect(field("Layer 2 name").placeholder).toBe("Layer 2");
    act(() => button("Save")!.click());
    expect(onSubmit).toHaveBeenCalledWith({ label: "Build", rows: 1 }, [{ label: "" }, { label: "" }]);
  });

  it("focuses the name field first", () => {
    open({ mode: "edit", initial: { label: "Build", rows: 1, layers: [{ key: "dev", label: "Dev" }] } });
    expect(document.activeElement).toBe(nameField());
  });

  it("cancels the drag, not the dialog, when Escape is pressed mid-drag", () => {
    const { onCancel } = open({
      mode: "edit",
      initial: { label: "Build", rows: 1, layers: [{ key: "dev", label: "Dev" }, { key: "ops", label: "" }] },
    });
    act(() => dnd.onDragStart!());
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(onCancel).not.toHaveBeenCalled();
    act(() => dnd.onDragCancel!());
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("cancels", () => {
    const { onCancel, onSubmit } = open();
    act(() => button("Cancel")!.click());
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
