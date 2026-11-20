// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GenerateRequest } from "../generate";

const mocks = vi.hoisted(() => ({
  requests: [] as GenerateRequest[],
  answer: vi.fn((..._args: unknown[]) => Promise.resolve()),
}));

vi.mock("../../bridge/commands", () => ({
  GenerateRequests: vi.fn(() => Promise.resolve(mocks.requests)),
  GenerateAnswer: mocks.answer,
}));
vi.mock("../../bridge/runtime", () => ({ EventsOn: () => () => {}, BrowserOpenURL: vi.fn() }));

import { GenerateApproval } from "./GenerateApproval";

const request = (over: Partial<GenerateRequest> = {}): GenerateRequest => ({
  id: "g1",
  kind: "image",
  agent: "Claude",
  project: "lpm-web",
  prompt: "A giraffe flying a one-seat plane",
  model: "Nano Banana 2.1",
  provider: "Google",
  details: ["16:9"],
  cost: "about 3¢",
  out: "generated/a-giraffe-flying-a-one-seat.png",
  needsKey: null,
  keyLabel: "Google Gemini",
  projectGrant: true,
  overLimit: false,
  today: "Today: 2 images, 7¢ of your $2 limit",
  ...over,
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  mocks.answer.mockClear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function button(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll("button")].find((b) => b.textContent?.trim().startsWith(label));
}

function type(el: HTMLInputElement | HTMLTextAreaElement, text: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, text);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

async function show(req: GenerateRequest) {
  mocks.requests = [req];
  await act(async () => {
    root.render(<GenerateApproval />);
  });
}

describe("GenerateApproval", () => {
  it("shows the prompt, model, cost and file, and allows the project", async () => {
    await show(request());
    const text = document.body.textContent ?? "";
    expect(text).toContain("Claude wants to make an image");
    expect(text).toContain("A giraffe flying a one-seat plane");
    expect(text).toContain("Nano Banana 2.1 · Google");
    expect(text).toContain("about 3¢");
    expect(text).toContain("generated/a-giraffe-flying-a-one-seat.png");
    expect(text).toContain("Today: 2 images, 7¢ of your $2 limit");
    await act(async () => button("Allow in lpm-web")?.click());
    expect(mocks.answer).toHaveBeenCalledWith("g1", "project", "A giraffe flying a one-seat plane", undefined);
  });

  it("sends the prompt as edited", async () => {
    await show(request());
    await act(async () => button("Edit")?.click());
    const area = document.querySelector("textarea")!;
    await act(async () => type(area, "A giraffe flying a red plane at sunset"));
    await act(async () => button("Just this once")?.click());
    expect(mocks.answer).toHaveBeenCalledWith("g1", "once", "A giraffe flying a red plane at sunset", undefined);
  });

  it("asks for a missing key and won't go on without one", async () => {
    await show(request({ needsKey: "gemini", projectGrant: true }));
    expect(document.body.textContent).toContain("Add a Google Gemini key to make this image");
    expect(button("Allow in lpm-web")).toBeUndefined();
    await act(async () => button("Save and continue")?.click());
    expect(mocks.answer).not.toHaveBeenCalled();
    const input = document.querySelector<HTMLInputElement>('input[type="password"]')!;
    await act(async () => type(input, "  AIza-test  "));
    await act(async () => button("Save and continue")?.click());
    expect(mocks.answer).toHaveBeenCalledWith("g1", "once", "A giraffe flying a one-seat plane", "AIza-test");
  });

  it("says when a request goes past today's limit, and denies", async () => {
    await show(request({ overLimit: true, projectGrant: false, kind: "speech", details: ["Marin voice", "mp3"] }));
    const text = document.body.textContent ?? "";
    expect(text).toContain("Claude wants to make audio");
    expect(text).toContain("This goes past today's limit.");
    expect(button("Just this once")).toBeUndefined();
    await act(async () => button("Deny")?.click());
    expect(mocks.answer).toHaveBeenCalledWith("g1", "deny", "A giraffe flying a one-seat plane", undefined);
  });
});
