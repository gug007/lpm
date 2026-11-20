import { describe, expect, it } from "vitest";
import { popupDocument } from "./popupDocument";
import type { PopupPayload } from "./popupTypes";

const payload: PopupPayload = {
  view: "tab",
  data: null,
  text: "",
  error: "",
  theme: { mode: "dark", colors: {} as PopupPayload["theme"]["colors"] },
  project: "web",
  action: "board",
};

type Lpm = {
  run: (action: unknown, inputs?: unknown) => Promise<unknown>;
  refresh: () => void;
};

// The page's bootstrap in a stand-in window: `extra` is what the window holds
// besides (a parent frame, a phone's message handler, fetch).
function boot(extra: Record<string, unknown>, post?: string) {
  const doc = popupDocument("<p></p>", { ...payload, post });
  const script = /<script>([\s\S]*?)<\/script>/.exec(doc)?.[1] ?? "";
  const listeners: ((event: { source: unknown; data: unknown }) => void)[] = [];
  const win: Record<string, unknown> = {
    addEventListener: (type: string, fn: (event: { source: unknown; data: unknown }) => void) => {
      if (type === "message") listeners.push(fn);
    },
    console,
    ...extra,
  };
  if (!("parent" in extra)) win.parent = win;
  const doc0 = { documentElement: { style: { setProperty: () => {} } }, addEventListener: () => {} };
  new Function("window", "document", "fetch", script)(win, doc0, extra.fetch);
  const message = (data: unknown) => listeners.forEach((fn) => fn({ source: win.parent, data }));
  return { lpm: win.lpm as Lpm, win, message };
}

describe("a page's lpm.run", () => {
  it("asks the frame's parent and settles on its reply", async () => {
    const asked: unknown[] = [];
    const page = boot({ parent: { postMessage: (m: unknown) => asked.push(m) } });
    const ran = page.lpm.run("db:seed", { rows: 5, skip: null, env: "dev" });
    expect(asked).toEqual([{ lpmRun: { id: "1", action: "db:seed", inputs: { rows: "5", env: "dev" } } }]);
    page.message({ lpmReply: { id: "1", ok: true, output: "seeded" } });
    expect(await ran).toEqual({ ok: true, output: "seeded", error: "", canceled: false });
  });

  it("goes to a phone's message handler", async () => {
    const asked: unknown[] = [];
    const page = boot({ webkit: { messageHandlers: { lpm: { postMessage: (m: unknown) => asked.push(m) } } } });
    const ran = page.lpm.run("deploy");
    page.lpm.refresh();
    expect(asked).toEqual([{ lpmRun: { id: "1", action: "deploy", inputs: {} } }, { lpmRefresh: true }]);
    (page.win.__lpmReply as (r: unknown) => void)({ id: "1", canceled: true });
    expect(await ran).toEqual({ ok: false, output: "", error: "", canceled: true });
  });

  it("goes to Android's bridge as JSON", () => {
    const asked: string[] = [];
    const page = boot({ lpmAndroid: { postMessage: (m: string) => asked.push(m) } });
    void page.lpm.run("deploy");
    expect(asked.map((m) => JSON.parse(m))).toEqual([{ lpmRun: { id: "1", action: "deploy", inputs: {} } }]);
  });

  it("posts to the desktop's address from a webview of its own", () => {
    const sent: { url: string; body: string }[] = [];
    const fetch = (url: string, init: { body: string }) => {
      sent.push({ url, body: init.body });
      return Promise.resolve();
    };
    const page = boot({ fetch }, "lpm-page://localhost/");
    void page.lpm.run("deploy");
    expect(sent).toEqual([{ url: "lpm-page://localhost/", body: '{"lpmRun":{"id":"1","action":"deploy","inputs":{}}}' }]);
  });

  it("says so where there's no one to ask", async () => {
    const page = boot({});
    expect(await page.lpm.run("deploy")).toEqual({
      ok: false,
      output: "",
      error: "This page can't run actions here.",
      canceled: false,
    });
  });

  it("ignores a reply nothing's waiting for", async () => {
    const page = boot({ parent: { postMessage: () => {} } });
    const ran = page.lpm.run("a");
    page.message({ lpmReply: { id: "9", ok: true } });
    page.message({ lpmReply: { id: "1", ok: "yes", output: 3 } });
    expect(await ran).toEqual({ ok: false, output: "", error: "", canceled: false });
  });
});
