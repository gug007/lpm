// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { launchpadTabs } from "../../launchpadAgentActions";
import type { ActionInfo } from "../../types";
import { LaunchpadDestinationTabs } from "./LaunchpadDestinationTabs";

const action = (name: string, cmd: string, extra: Partial<ActionInfo> = {}): ActionInfo =>
  ({ name, label: name.split(":").pop(), cmd, confirm: false, display: "header", type: "terminal", ...extra }) as ActionInfo;

const claude = action("claude", "claude", {
  label: "Claude",
  emoji: "✻",
  children: [
    action("claude:direct", "claude --model opus", { label: "Claude", emoji: "⚡" }),
    action("claude:noPersist", "claude --model sonnet", { label: "Claude", emoji: "🕶️" }),
  ],
});
const agents = action("agents", "", {
  label: "Agents",
  emoji: "🤖",
  children: [action("agents:fast", "claude", { label: "Fast", emoji: "⚡" }), action("agents:gemini", "gemini", { label: "Gemini" })],
});

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.localStorage.clear();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function render(actions: ActionInfo[], value = "terminal") {
  const onChange = vi.fn();
  act(() =>
    root.render(<LaunchpadDestinationTabs tabs={launchpadTabs(actions, "web")} value={value} onChange={onChange} />),
  );
  return onChange;
}

const radio = (text: string) =>
  [...host.querySelectorAll<HTMLElement>('[role="radio"]')].find((el) => el.textContent?.includes(text))!;
const face = (el: Element) => [el.querySelector("svg")?.getAttribute("data-agent") ?? null, el.textContent];

async function openMenu(name: string) {
  const trigger = host.querySelector<HTMLElement>(`[aria-label="Pick from ${name}"], [aria-haspopup="menu"]`)!;
  await act(async () => trigger.click());
  return [...document.querySelectorAll('[role="menuitemradio"]')];
}

describe("LaunchpadDestinationTabs", () => {
  it("tells variants with the same label apart by their emoji, an agent's as its mark", async () => {
    render([claude]);
    const rows = await openMenu("Claude");
    expect(rows.map(face)).toEqual([
      ["claude", "Claude"],
      [null, "⚡Claude"],
      [null, "🕶️Claude"],
    ]);
  });

  it("shows the picked variant's emoji on the split's main part", () => {
    render([claude], "claude:noPersist");
    expect(face(host.querySelector('[role="radio"][aria-checked="true"]')!)).toEqual([null, "🕶️Claude"]);
  });

  it("shows a single action's emoji in place of the agent's mark", () => {
    render([action("codex", "codex", { label: "Codex", emoji: "🧪" })]);
    expect(face(radio("Codex"))).toEqual([null, "🧪Codex"]);
  });

  it("keeps the agent's mark on an action with no emoji", () => {
    render([action("gemini", "gemini", { label: "Gemini" })]);
    expect(face(radio("Gemini"))).toEqual(["gemini", "Gemini"]);
  });

  it("leads a menu with its own emoji until an item is picked", () => {
    render([agents]);
    expect(host.querySelector('[aria-haspopup="menu"]')!.textContent).toBe("🤖Agents");
    render([agents], "agents:fast");
    expect(host.querySelector('[aria-haspopup="menu"]')!.textContent).toBe("⚡Fast");
  });

  it("leaves the bare agents of a project with no agent actions as they are", () => {
    render([]);
    expect(face(radio("Claude"))).toEqual(["claude", "Claude"]);
  });
});
