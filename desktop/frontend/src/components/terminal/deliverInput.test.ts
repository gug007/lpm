import { afterEach, describe, expect, it, vi } from "vitest";
import type { DeliveryTarget } from "./deliverInput";

const writes: string[] = [];
let receiver: DeliveryTarget | null = null;

// Every write draws on the receiver, the way a live program answers its input.
vi.mock("../../terminal-io", () => ({
  sendTerminalInput: vi.fn(async (_id: string, data: string) => {
    writes.push(data);
    if (receiver) receiver.lastOutputAt = performance.now() + 1;
  }),
}));

const toastError = vi.fn();
vi.mock("../../notifications/toast", () => ({ toast: { error: toastError } }));

const { deliverInput } = await import("./deliverInput");

// A receiver whose screen shows `rows`, the way an agent's dialog is drawn.
function showing(rows: string[]): DeliveryTarget {
  const t = target(true);
  Object.assign(t.term, {
    rows: rows.length,
    cols: 100,
    buffer: {
      active: {
        baseY: 0,
        length: rows.length,
        getLine: (i: number) => ({ translateToString: () => rows[i] ?? "" }),
      },
    },
  });
  return t;
}

const PERMISSION = [
  " touch notes.txt",
  " Do you want to proceed?",
  " ❯ 1. Yes",
  "   2. Yes, and always allow access to /work/shop from this project",
  "   3. No",
  " Esc to cancel · Tab to amend",
];
const QUESTION = [
  "Which color should the button be?",
  "❯ 1. Red",
  "  2. Blue",
  "  3. Type something.",
  "Enter to select · ↑/↓ to navigate · Esc to cancel",
];

function target(bracketedPasteMode: boolean): DeliveryTarget {
  const term = {
    modes: { bracketedPasteMode },
    buffer: { active: { baseY: 0, length: 0, getLine: () => undefined } },
  };
  receiver = { term: term as unknown as DeliveryTarget["term"], sessionDead: false, lastOutputAt: 0, delivering: false };
  return receiver;
}

afterEach(() => {
  writes.length = 0;
  receiver = null;
});

describe("deliverInput", () => {
  it("gives a plain shell the line and its Enter in one write", () => {
    expect(deliverInput(target(false), "t1", "ls")).toBe(true);
    expect(writes).toEqual(["ls\r"]);
  });

  it("pastes into an agent's prompt, then presses Enter on its own", async () => {
    const t = target(true);
    expect(deliverInput(t, "peer-ab12cd34-t1", "Where would a discount code fit in?")).toBe(true);
    await vi.waitFor(() => expect(t.delivering).toBe(false));
    expect(writes).toEqual(["\x1b[200~Where would a discount code fit in?\x1b[201~", "\r"]);
  });

  it("holds a message back while a permission prompt would take its Enter as Yes", () => {
    expect(deliverInput(showing(PERMISSION), "t1", "wait, use another name")).toBe(false);
    expect(writes).toEqual([]);
    expect(toastError).toHaveBeenCalledWith("Answer the agent first", expect.anything());
  });

  it("still sends into a question that takes a typed answer", async () => {
    const t = showing(QUESTION);
    expect(deliverInput(t, "t1", "green")).toBe(true);
    await vi.waitFor(() => expect(t.delivering).toBe(false));
    expect(writes).toEqual(["\x1b[200~green\x1b[201~", "\r"]);
  });

  it("refuses a send while one is still going, and once the tab has ended", () => {
    const busy = target(true);
    busy.delivering = true;
    expect(deliverInput(busy, "t1", "again")).toBe(false);
    const ended = target(true);
    ended.sessionDead = true;
    expect(deliverInput(ended, "t1", "hello")).toBe(false);
    expect(writes).toEqual([]);
  });
});
