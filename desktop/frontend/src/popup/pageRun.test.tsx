// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionInfo } from "../types";
import type { PopupPayload } from "./popupTypes";

const openUrl = vi.hoisted(() => vi.fn());
vi.mock("../../bridge/runtime", () => ({ BrowserOpenURL: openUrl, EventsOnReady: vi.fn() }));

import { InlinePopupFrame } from "./InlinePopupFrame";
import { givenInputs, PageRunContext, pageOutput, pageRunAskOf, type PageRunner } from "./pageRun";

const deploy = {
  name: "deploy",
  label: "Deploy",
  cmd: "./deploy.sh",
  inputs: [
    { key: "env", label: "Env", type: "select", required: true, placeholder: "", default: "", persist: false,
      options: [{ label: "Staging", value: "staging" }, { label: "Prod", value: "prod" }] },
    { key: "note", label: "Note", type: "text", required: false, placeholder: "", default: "", persist: false },
  ],
} as ActionInfo;

describe("page runs", () => {
  it("reads a run the page asked for, and nothing else", () => {
    expect(pageRunAskOf({ lpmRun: { id: "1", action: "deploy", inputs: { env: "prod", n: 3 } } })).toEqual({
      id: "1",
      action: "deploy",
      inputs: { env: "prod" },
    });
    expect(pageRunAskOf({ lpmRun: { id: 1, action: "deploy" } })).toBeNull();
    expect(pageRunAskOf({ lpmOpen: "https://lpm.cx" })).toBeNull();
    expect(pageRunAskOf(null)).toBeNull();
  });

  it("keeps the inputs a page filled the way the form would take them", () => {
    expect(givenInputs(deploy, { env: "prod", note: "" })).toEqual({ values: { env: "prod", note: "" }, complete: true });
    expect(givenInputs(deploy, { env: "qa", note: "x" })).toEqual({ values: { note: "x" }, complete: false });
    expect(givenInputs(deploy, { env: "prod", other: "x" })).toEqual({ values: { env: "prod" }, complete: false });
  });

  it("hands back output without its colors, newest last", () => {
    expect(pageOutput(["\x1b[32mok\x1b[0m", "done"])).toBe("ok\ndone");
    expect(pageOutput(["x".repeat(300 * 1024), "end"]).endsWith("end")).toBe(true);
    expect(pageOutput(["x".repeat(300 * 1024)]).length).toBe(256 * 1024);
  });
});

const payload: PopupPayload = {
  view: "tab",
  data: null,
  text: "",
  error: "",
  theme: { mode: "dark", colors: {} as PopupPayload["theme"]["colors"] },
  project: "web",
  action: "board",
};

describe("a framed page", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function frame(runner: PageRunner | null, onRefresh = vi.fn()) {
    await act(async () => {
      root.render(
        <PageRunContext.Provider value={runner}>
          <InlinePopupFrame html="<p></p>" payload={payload} width="100%" height="100%" onFailure={() => {}} onRefresh={onRefresh} />
        </PageRunContext.Provider>,
      );
    });
    const page = container.querySelector("iframe")!.contentWindow!;
    const replies: unknown[] = [];
    page.postMessage = ((message: unknown) => replies.push(message)) as typeof page.postMessage;
    const ask = async (data: unknown) => {
      await act(async () => {
        window.dispatchEvent(new MessageEvent("message", { data, source: page }));
      });
    };
    return { ask, replies, onRefresh };
  }

  it("runs what the page asks one at a time and replies", async () => {
    let finish: (r: { ok: boolean; output: string }) => void = () => {};
    const runner = vi.fn(() => new Promise<{ ok: boolean; output: string }>((resolve) => (finish = resolve)));
    const { ask, replies } = await frame(runner);
    await ask({ lpmRun: { id: "1", action: "seed", inputs: { rows: "5" } } });
    await ask({ lpmRun: { id: "2", action: "seed", inputs: {} } });
    expect(runner).toHaveBeenCalledTimes(1);
    expect(runner).toHaveBeenCalledWith("seed", { rows: "5" });
    expect(replies).toEqual([
      { lpmReply: { ok: false, error: "This page's last run hasn't finished.", id: "2" } },
    ]);
    await act(async () => finish({ ok: true, output: "seeded" }));
    expect(replies[1]).toEqual({ lpmReply: { ok: true, output: "seeded", id: "1" } });
  });

  it("says so outside a project, and passes refreshes on", async () => {
    const { ask, replies, onRefresh } = await frame(null);
    await ask({ lpmRun: { id: "1", action: "seed", inputs: {} } });
    await ask({ lpmRefresh: true });
    expect(replies).toEqual([{ lpmReply: { ok: false, error: "This page can't run actions here.", id: "1" } }]);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
