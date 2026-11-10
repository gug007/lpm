// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JobDialogs, type JobEditing } from "./JobDialogs";
import type { JobInfo } from "../../../jobsFormat";

vi.mock("../../../../bridge/commands", () =>
  new Proxy({}, {
    has: () => true,
    get: (_t, prop) => (prop === "then" ? undefined : vi.fn(() => Promise.resolve(null))),
  }));
vi.mock("../../../../bridge/runtime", () =>
  new Proxy({}, {
    has: () => true,
    get: (_t, prop) => (prop === "then" ? undefined : vi.fn(() => () => {})),
  }));

const config = vi.hoisted(() => ({
  readJobPayloadFrom: vi.fn(async () => ({
    label: "Support triage",
    schedule: { every: "5m" },
    run: { prompt: "Check the support chats." },
  })),
}));
vi.mock("../../../jobsConfig", async (orig) => ({
  ...(await orig<typeof import("../../../jobsConfig")>()),
  readJobPayloadFrom: config.readJobPayloadFrom,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

const job: JobInfo = { id: "triage", label: "Support triage", valid: true, enabled: true };
const editing: JobEditing = { mode: "edit", project: "shop", job };

const show = () =>
  act(async () => {
    root.render(
      <JobDialogs
        projects={[]}
        editing={editing}
        onCloseEditor={() => {}}
        onSaved={() => {}}
        actionsFor={() => []}
        knownIds={() => []}
        removing={null}
        removingRunning={false}
        onCancelRemove={() => {}}
        onConfirmRemove={() => {}}
        runPick={null}
        onCancelRunPick={() => {}}
        onRunPicked={() => {}}
      />,
    );
  });

const nameField = () =>
  document.body.querySelector<HTMLInputElement>('input[placeholder="Name this automation"]')!;

const typeName = (value: string) =>
  act(async () => {
    const input = nameField();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.clearAllMocks();
});

describe("JobDialogs", () => {
  it("keeps the edits when the page behind the editor redraws", async () => {
    await show();
    expect(nameField().value).toBe("Support triage");

    await typeName("Support triage, hourly");
    expect(nameField().value).toBe("Support triage, hourly");
    // Every job-status event redraws the Automations page with the same state.
    await show();
    await show();

    expect(nameField().value).toBe("Support triage, hourly");
    expect(config.readJobPayloadFrom).toHaveBeenCalledTimes(1);
  });
});
