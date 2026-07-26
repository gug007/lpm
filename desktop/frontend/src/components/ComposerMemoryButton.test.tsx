// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ComposerMemoryButton } from "./ComposerMemoryButton";
import type { MemorySessionInfo } from "../hooks/useMemorySessions";
import type { MentionItem } from "../mentions";

const SESSIONS: MentionItem[] = [
  { kind: "memory", label: "auth-refactor", insert: "auth-refactor", detail: "Rework login" },
  { kind: "memory", label: "billing", insert: "billing", detail: "Stripe migration" },
];

const INFO = new Map<string, MemorySessionInfo>([
  ["auth-refactor", { title: "Rework login", updatedAt: Date.now(), preview: "" }],
  ["billing", { title: "Stripe migration", updatedAt: Date.now(), preview: "" }],
]);

let container: HTMLDivElement;
let root: Root;

function render(props: Partial<Parameters<typeof ComposerMemoryButton>[0]> = {}) {
  act(() => {
    root.render(
      <ComposerMemoryButton
        sessions={SESSIONS}
        infoById={INFO}
        onOpen={props.onOpen ?? vi.fn()}
        onPick={props.onPick ?? vi.fn()}
        onView={props.onView ?? vi.fn()}
        onDelete={props.onDelete ?? vi.fn()}
        {...props}
      />,
    );
  });
}

function click(el: Element) {
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

const trigger = () => container.querySelector("button[aria-label='Memory']")!;
const rows = () =>
  Array.from(document.querySelectorAll("body button")).filter((b) => !container.contains(b));

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("ComposerMemoryButton", () => {
  it("opens on click and lists the saved sessions", () => {
    const onOpen = vi.fn();
    render({ onOpen });
    expect(rows()).toHaveLength(0);

    click(trigger());

    expect(onOpen).toHaveBeenCalledTimes(1);
    const labels = rows().map((b) => b.textContent);
    expect(labels[0]).toContain("Remember this conversation");
    expect(labels.join(" ")).toContain("auth-refactor");
    expect(labels.join(" ")).toContain("Stripe migration");
  });

  it("picks a session and closes", () => {
    const onPick = vi.fn();
    render({ onPick });
    click(trigger());
    click(rows().find((b) => b.textContent?.includes("auth-refactor"))!);

    expect(onPick).toHaveBeenCalledWith(SESSIONS[0]);
    expect(rows()).toHaveLength(0);
  });

  it("opens a session in the Memory tab without inserting it", () => {
    const onView = vi.fn();
    const onPick = vi.fn();
    render({ onView, onPick });
    click(trigger());
    click(document.querySelector("button[aria-label='Open auth-refactor in Memory']")!);

    expect(onView).toHaveBeenCalledWith(SESSIONS[0]);
    expect(onPick).not.toHaveBeenCalled();
    expect(rows()).toHaveLength(0);
  });

  it("deletes only after the confirmation is accepted", () => {
    const onDelete = vi.fn();
    render({ onDelete });
    click(trigger());
    click(document.querySelector("button[aria-label='Delete auth-refactor']")!);

    expect(document.body.textContent).toContain("Delete session?");
    expect(onDelete).not.toHaveBeenCalled();

    click(rows().find((b) => b.textContent === "Delete")!);

    expect(onDelete).toHaveBeenCalledWith(SESSIONS[0]);
    expect(document.body.textContent).not.toContain("Delete session?");
    // The panel outlives the delete, so more rows can be cleared in one pass.
    expect(document.body.textContent).toContain("Continue a session");
  });

  it("keeps the session on cancel, and Escape closes the dialog before the panel", () => {
    const onDelete = vi.fn();
    render({ onDelete });
    click(trigger());
    click(document.querySelector("button[aria-label='Delete billing']")!);

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(onDelete).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("Delete session?");
    expect(document.body.textContent).toContain("Continue a session");
  });

  it("offers the bare invocation with no sessions saved", () => {
    const onPick = vi.fn();
    render({ sessions: [], infoById: new Map(), onPick });
    click(trigger());

    expect(document.body.textContent).toContain("Nothing saved yet");
    click(rows()[0]);
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ kind: "memory-save", insert: "" }));
  });
});
