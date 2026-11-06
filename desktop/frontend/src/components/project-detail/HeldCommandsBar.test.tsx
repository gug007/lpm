// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const allowRepoCommands = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock("../../../bridge/commands", () => ({ AllowRepoCommands: allowRepoCommands }));
vi.mock("../../notifications/toast", () => ({ toast: { error: vi.fn() } }));

import { HeldCommandsBar } from "./HeldCommandsBar";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  allowRepoCommands.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const button = (name: string) =>
  [...container.querySelectorAll("button")].find((b) => b.textContent === name) as HTMLButtonElement;

describe("HeldCommandsBar", () => {
  it("shows the exact commands on review and allows them for the project", async () => {
    const commands = ["gh api repos/acme/shop --jq .stargazers_count", "./.lpm/stars.sh"];
    act(() => root.render(<HeldCommandsBar projectName="shop" commands={commands} />));
    expect(container.textContent).toContain("has 2 commands that run by themselves");
    expect(container.textContent).not.toContain("./.lpm/stars.sh");

    act(() => button("Review").click());
    expect([...container.querySelectorAll("li")].map((li) => li.textContent)).toEqual(commands);

    await act(async () => button("Allow").click());
    expect(allowRepoCommands).toHaveBeenCalledWith("shop");
  });
});
