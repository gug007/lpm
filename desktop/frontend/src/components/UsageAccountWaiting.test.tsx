// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { UsageAccountWaiting } from "./UsageAccountWaiting";

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

function text(signedIn: boolean, projects: string[]): string {
  act(() => {
    root.render(<UsageAccountWaiting name="Work" signedIn={signedIn} projects={projects} />);
  });
  return container.textContent ?? "";
}

describe("UsageAccountWaiting", () => {
  it("asks to sign in before anything else", () => {
    expect(text(false, ["api"])).toContain("isn't signed in yet");
  });

  it("says when no project uses the account", () => {
    expect(text(true, [])).toContain("No project uses this account yet");
  });

  it("names the projects that use the account", () => {
    expect(text(true, ["api"])).toContain("answers in api.");
    expect(text(true, ["api", "web"])).toContain("answers in api or web.");
    expect(text(true, ["api", "web", "docs"])).toContain("answers in api, web, or 1 other project.");
    expect(text(true, ["api", "web", "docs", "ios"])).toContain("or 2 other projects.");
  });
});
