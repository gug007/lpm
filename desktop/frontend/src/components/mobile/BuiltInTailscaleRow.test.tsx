// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../bridge/runtime", () => ({
  BrowserOpenURL: vi.fn(),
}));

import { BuiltInTailscaleRow } from "./BuiltInTailscaleRow";
import { DEFAULT_TAILNET_STATE, type TailnetState } from "../../tailnetStatus";
import type { Tailnet } from "../../hooks/useTailnetState";

let container: HTMLDivElement;
let root: Root;

function tailnet(state: Partial<TailnetState>, opened = false): Tailnet {
  return {
    state: { ...DEFAULT_TAILNET_STATE, enabled: true, ...state },
    loaded: true,
    busy: null,
    failure: null,
    opened,
    setEnabled: vi.fn(async () => {}),
    signIn: vi.fn(async () => {}),
    signOut: vi.fn(async () => {}),
  };
}

function render(t: Tailnet) {
  act(() => {
    root.render(<BuiltInTailscaleRow tailnet={t} hasApp={false} live deviceOnTailscale={false} />);
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("BuiltInTailscaleRow", () => {
  it("reads a start after sign-in as the sign-in finishing, not setup starting over", () => {
    render(tailnet({ state: "needsLogin", authUrl: "https://login.example/a" }, true));
    expect(container.textContent).toContain("Waiting for you to sign in");

    render(tailnet({ state: "starting" }));
    expect(container.textContent).toContain("Finishing sign-in…");
    expect(container.textContent).not.toContain("Sign in with Tailscale");
    expect(container.textContent).not.toContain("Cancel");

    render(tailnet({ state: "running", account: "you@example.com", ip: "100.64.0.1" }));
    expect(container.textContent).toContain("you@example.com · 100.64.0.1");
  });

  it("still offers Cancel while a fresh node starts", () => {
    render(tailnet({ state: "starting" }));
    expect(container.textContent).toContain("Starting…");
    expect(container.textContent).toContain("Cancel");
  });
});
