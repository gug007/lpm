// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSettingsStore } from "../../store/settings";
import { useVideoSetup } from "../../store/videoSetup";
import type { VideoSetupPart } from "../../videoSetup";
import { VideoSettingsBody } from "./VideoSettingsBody";

vi.mock("../../platform", async (original) => ({
  ...(await original<typeof import("../../platform")>()),
  isMac: true,
}));
const info = { keySaved: false, videosDir: "/Users/me/Movies/explaincast" };
// What the window's own setup check finds: the parts each test starts with.
const found = (): VideoSetupPart[] | null => useVideoSetup.getState().parts;
vi.mock("../../../bridge/commands", () => ({
  VideoSettingsInfo: () => Promise.resolve(info),
  VideoSetupCheck: () => Promise.resolve(found()),
  VideoVoiceSample: () => Promise.resolve(""),
  VideoSetOpenAIKey: () => Promise.resolve(),
  VideoClearOpenAIKey: () => Promise.resolve(),
  OpenPathInDefaultApp: () => Promise.resolve(),
  OpenAIVoices: () => Promise.resolve(["alloy", "cedar", "marin"]),
}));

const ready = (id: VideoSetupPart["id"]): VideoSetupPart => ({ id, ready: true, needsHomebrew: false });

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  useVideoSetup.setState({ parts: [ready("skill"), ready("ffmpeg"), ready("voice")], running: false });
  useSettingsStore.setState({ update: (partial) => Promise.resolve(void useSettingsStore.setState(partial)) });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = "";
  useSettingsStore.setState({ videoNarrator: undefined, videoCloudVoice: undefined, videoLocalVoice: undefined });
});

async function render() {
  await act(async () => root.render(<VideoSettingsBody onDone={() => {}} />));
}

const card = (name: string) =>
  [...host.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find((b) => b.textContent?.includes(name))!;
const text = () => host.textContent ?? "";

describe("Video settings", () => {
  it("shows the Mac voice by name, with no key field and ready to record", async () => {
    await render();
    expect(card("On this Mac").getAttribute("aria-checked")).toBe("true");
    expect(text()).toContain("Installed · about 1 GB");
    expect(host.querySelector("select")?.selectedOptions[0].textContent).toBe("Heart · American female");
    expect(host.querySelector('input[type="password"]')).toBeNull();
    expect(text()).toContain("Ready to record");
    expect(text()).toContain("Videos folder");
  });

  it("asks for the key once the cloud voice is picked, priced in dollars", async () => {
    await render();
    expect(card("OpenAI cloud").textContent).toContain("≈ $0.02 a minute");
    await act(async () => card("OpenAI cloud").click());
    expect(useSettingsStore.getState().videoNarrator).toBe("openai");
    expect(host.querySelector('input[type="password"]')).not.toBeNull();
    expect(text()).toContain("Needed");
    expect(text()).toContain("Add a key to use the cloud voice");
    expect(host.querySelector('[aria-label="Save your key to hear it"]')).not.toBeNull();
  });

  it("sends the window to setup when parts are missing", async () => {
    useVideoSetup.setState({ parts: [ready("skill"), { ...ready("ffmpeg"), ready: false }, { ...ready("voice"), ready: false }] });
    await render();
    expect(text()).toContain("2 parts to install");
    expect(text()).toContain("Set up…");
    expect(text()).toContain("About 1 GB to download, once");
    expect(host.querySelector('[aria-label="Install the local voice to hear it"]')).not.toBeNull();
  });
});
