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

const trigger = () => container.querySelector("button[aria-label='Project memory']")!;
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

  it("offers the bare invocation with no sessions saved", () => {
    const onPick = vi.fn();
    render({ sessions: [], infoById: new Map(), onPick });
    click(trigger());

    expect(document.body.textContent).toContain("Nothing saved yet");
    click(rows()[0]);
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ kind: "memory-save", insert: "" }));
  });
});
