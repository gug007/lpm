import { describe, expect, it } from "vitest";
import {
  addCustomWorkStatus,
  customWorkStatusChoice,
  existingNoteFor,
  nextWorkStatus,
  removeCustomWorkStatus,
  removeFromWorkStatusOrder,
  renameInWorkStatusOrder,
  retagWorkStatus,
  sameWorkStatus,
  updateCustomWorkStatus,
  workStatusChoiceKey,
  workStatusEmoji,
  workStatusKey,
  workStatusMenu,
  workStatusNameClash,
  workStatusNote,
  workStatusTitle,
  DEFAULT_WORK_STATUS_PALETTE,
} from "./workStatus";
import type { WorkStatus } from "./types";

const blocked: WorkStatus = { state: "blocked", note: "waiting on the API key", since: 100 };
const review: WorkStatus = { state: "custom", label: "Review", emoji: "👀", since: 0 };

describe("status identity", () => {
  it("is the state, plus the label when custom", () => {
    expect(workStatusKey(blocked)).toBe("blocked");
    expect(workStatusKey(review)).toBe("custom:Review");
    expect(sameWorkStatus(review, { state: "custom", label: "Review" })).toBe(true);
    expect(sameWorkStatus(review, { state: "custom", label: "QA" })).toBe(false);
    expect(sameWorkStatus(blocked, { state: "blocked" })).toBe(true);
    expect(sameWorkStatus(undefined, { state: "blocked" })).toBe(false);
  });
});

describe("nextWorkStatus", () => {
  it("clears on null", () => {
    expect(nextWorkStatus(blocked, null, 500)).toBeUndefined();
  });

  it("restarts the clock on a change of status and drops the old note", () => {
    expect(nextWorkStatus(blocked, { state: "done" }, 500)).toEqual({ state: "done", since: 500 });
  });

  it("keeps the clock on a note-only edit", () => {
    expect(nextWorkStatus(blocked, { state: "blocked", note: "  now the deploy  " }, 500)).toEqual({
      state: "blocked",
      note: "now the deploy",
      since: 100,
    });
  });

  it("carries a custom status's label and emoji, and treats a new label as a new status", () => {
    const first = nextWorkStatus(undefined, { state: "custom", label: " Review ", emoji: "🔍" }, 1);
    expect(first).toEqual({ state: "custom", label: "Review", emoji: "🔍", since: 1 });
    expect(nextWorkStatus(first, { state: "custom", label: "Review", emoji: "👀" }, 2)?.since).toBe(1);
    expect(nextWorkStatus(first, { state: "custom", label: "QA" }, 2)?.since).toBe(2);
  });

  it("refuses a custom status without a label", () => {
    expect(nextWorkStatus(blocked, { state: "custom", label: "  " }, 5)).toBe(blocked);
  });
});

describe("what a status shows", () => {
  it("has a fixed emoji for the built-in states and the status's own for custom", () => {
    expect(workStatusEmoji(blocked)).toBe("⛔");
    expect(workStatusEmoji(review)).toBe("👀");
    expect(workStatusEmoji({ state: "custom" })).toBe("");
  });

  it("carries the trimmed line on any status, or nothing", () => {
    expect(workStatusNote(blocked)).toBe("waiting on the API key");
    expect(workStatusNote({ state: "blocked", since: 0 })).toBeNull();
    expect(workStatusNote({ ...review, note: " eyes on it " })).toBe("eyes on it");
    expect(workStatusNote(undefined)).toBeNull();
  });

  it("puts the note under the name in the tooltip", () => {
    expect(workStatusTitle(blocked)).toBe("Blocked\nwaiting on the API key");
    expect(workStatusTitle(review)).toBe("Review");
  });
});

describe("the Status menu", () => {
  const names = (choices: { emoji: string; label: string }[]) =>
    choices.map((c) => `${c.emoji} ${c.label}`);

  it("is one list: the built-in states and the palette", () => {
    const palette = [...DEFAULT_WORK_STATUS_PALETTE, { label: "QA", emoji: "🧪" }];
    expect(names(workStatusMenu(palette))).toEqual([
      "⏳ In progress",
      "👀 Review",
      "🚀 Ready",
      "✅ Done",
      "⛔ Blocked",
      "⏰ Waiting",
      "❓ Needs decision",
      "⏸️ Paused",
      "🧪 QA",
    ]);
    const builtInOnly = ["⏳ In progress", "✅ Done", "⛔ Blocked"];
    expect(names(workStatusMenu([]))).toEqual(builtInOnly);
    expect(names(workStatusMenu([], []))).toEqual(builtInOnly);
  });

  it("names a row the way the saved order does", () => {
    expect(workStatusMenu(DEFAULT_WORK_STATUS_PALETTE).map(workStatusChoiceKey)).toEqual([
      "in_progress",
      "custom:Review",
      "custom:Ready",
      "done",
      "blocked",
      "custom:Waiting",
      "custom:Needs decision",
      "custom:Paused",
    ]);
    expect(workStatusChoiceKey(customWorkStatusChoice({ label: "QA", emoji: "🧪" }))).toBe(
      "custom:QA",
    );
  });

  it("puts the ordered rows first and leaves the rest in their default order", () => {
    const order = ["done", "custom:QA", "blocked", "custom:Gone"];
    const palette = [...DEFAULT_WORK_STATUS_PALETTE, { label: "QA", emoji: "🧪" }];
    const menu = workStatusMenu(palette, order);
    expect(menu.map(workStatusChoiceKey)).toEqual([
      "done",
      "custom:QA",
      "blocked",
      "in_progress",
      "custom:Review",
      "custom:Ready",
      "custom:Waiting",
      "custom:Needs decision",
      "custom:Paused",
    ]);
  });

  it("counts a repeated key once and lands a status the order has never seen at the end", () => {
    const palette = [{ label: "QA", emoji: "🧪" }, { label: "Hotfix", emoji: "🔥" }];
    const menu = workStatusMenu(palette, ["custom:QA", "done", "custom:QA"]);
    expect(menu.map(workStatusChoiceKey).slice(0, 3)).toEqual([
      "custom:QA",
      "done",
      "in_progress",
    ]);
    expect(workStatusChoiceKey(menu[menu.length - 1])).toBe("custom:Hotfix");
  });

  it("stores a preset like a custom status and knows which rows ask for a line", () => {
    const menu = workStatusMenu(DEFAULT_WORK_STATUS_PALETTE);
    expect(menu[0].input).toEqual({ state: "in_progress" });
    expect(menu[1].input).toEqual({ state: "custom", label: "Review", emoji: "👀" });
    expect(menu.map((c) => c.asksNote)).toEqual([false, true, false, false, true, true, true, true]);
    expect(customWorkStatusChoice({ label: "QA", emoji: "🧪" }).asksNote).toBe(false);
    expect(customWorkStatusChoice({ label: "QA", emoji: "🧪", withNote: true }).asksNote).toBe(true);
  });

  it("keeps the order coherent when a status is renamed or removed", () => {
    const order = ["custom:QA", "done", "custom:Hotfix"];
    expect(renameInWorkStatusOrder(order, "QA", "Quality")).toEqual([
      "custom:Quality",
      "done",
      "custom:Hotfix",
    ]);
    expect(renameInWorkStatusOrder(order, "Missing", "Quality")).toBe(order);
    expect(renameInWorkStatusOrder(order, "QA", "  ")).toBe(order);
    expect(renameInWorkStatusOrder(undefined, "QA", "Quality")).toBeUndefined();
    expect(removeFromWorkStatusOrder(order, "QA")).toEqual(["done", "custom:Hotfix"]);
    expect(removeFromWorkStatusOrder(order, "Missing")).toEqual(order);
    expect(removeFromWorkStatusOrder(undefined, "QA")).toBeUndefined();
  });

  it("knows where a name is already taken", () => {
    const palette = [...DEFAULT_WORK_STATUS_PALETTE, { label: "QA", emoji: "🧪" }];
    expect(workStatusNameClash(palette, " review ", null)).toBe("yours");
    expect(workStatusNameClash(palette, "Blocked", null)).toBe("menu");
    expect(workStatusNameClash(palette, "qa", "Hotfix")).toBe("yours");
    expect(workStatusNameClash(palette, "qa", "QA")).toBeNull();
    expect(workStatusNameClash(palette, "Review", "Review")).toBeNull();
    expect(workStatusNameClash(palette, "New", null)).toBeNull();
  });

  it("offers the row's current note only when the choice keeps the same status", () => {
    expect(existingNoteFor(blocked, { state: "blocked" })).toBe("waiting on the API key");
    expect(existingNoteFor(blocked, { state: "custom", label: "Review" })).toBe("");
    expect(existingNoteFor({ ...review, note: "eyes" }, { state: "custom", label: "Review" })).toBe("eyes");
    expect(existingNoteFor(undefined, { state: "blocked" })).toBe("");
  });
});

describe("the user's own statuses", () => {
  const list = [
    { label: "QA", emoji: "🧪" },
    { label: "Hotfix", emoji: "🔥", withNote: true },
  ];

  it("adds, re-marks a repeat regardless of case, and removes", () => {
    const one = addCustomWorkStatus([], { label: " Review ", emoji: "🔍" });
    expect(one).toEqual([{ label: "Review", emoji: "🔍" }]);
    const two = addCustomWorkStatus(one, { label: "QA", emoji: "🧪" });
    expect(addCustomWorkStatus(two, { label: "review", emoji: "👀", withNote: true })).toEqual([
      { label: "QA", emoji: "🧪" },
      { label: "review", emoji: "👀", withNote: true },
    ]);
    expect(addCustomWorkStatus(two, { label: "   ", emoji: "👀" })).toBe(two);
    expect(addCustomWorkStatus([], { label: "Review", emoji: "🔍", withNote: false })).toEqual([
      { label: "Review", emoji: "🔍" },
    ]);
    expect(removeCustomWorkStatus(two, "QA")).toEqual(one);
  });

  it("keeps an edited status in its place and drops the setting when unticked", () => {
    expect(updateCustomWorkStatus(list, "Hotfix", { label: " Urgent ", emoji: "🚨" })).toEqual([
      { label: "QA", emoji: "🧪" },
      { label: "Urgent", emoji: "🚨" },
    ]);
    expect(updateCustomWorkStatus(list, "QA", { label: "  ", emoji: "🧪" })).toBe(list);
  });

  it("retags every row wearing the old status, keeping each row's line", () => {
    const projects = [
      { name: "a", workStatus: { state: "custom" as const, label: "QA", emoji: "🧪", note: "flaky", since: 0 } },
      { name: "b", workStatus: { state: "custom" as const, label: "Hotfix", emoji: "🔥", since: 0 } },
      { name: "c", workStatus: { state: "blocked" as const, since: 0 } },
      { name: "d" },
    ];
    expect(retagWorkStatus(projects, "QA", { label: "Quality", emoji: "🔬" })).toEqual([
      { name: "a", input: { state: "custom", label: "Quality", emoji: "🔬", note: "flaky" } },
    ]);
  });
});
