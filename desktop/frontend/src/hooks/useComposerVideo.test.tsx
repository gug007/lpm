// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useVideoAnswer } from "../store/videoAnswer";
import { useComposerVideo } from "./useComposerVideo";

const host = vi.hoisted(() => ({ isMac: true }));
const setup = vi.hoisted(() => ({ ready: true, asked: [] as string[] }));
vi.mock("../store/videoSetup", () => ({
  ensureVideoReady: async (terminalId: string) => {
    setup.asked.push(terminalId);
    return setup.ready;
  },
}));
vi.mock("../platform", () => ({
  get isMac() {
    return host.isMac;
  },
}));

type Input = Parameters<typeof useComposerVideo>[0];
type Video = ReturnType<typeof useComposerVideo>;

let container: HTMLDivElement;
let root: Root;
let video: Video;
// Each test gets a folder of its own: the skill, once seen for a CLI and
// folder, is remembered for the rest of the session.
let cwd = "";
let folders = 0;

function Probe(props: Input) {
  video = useComposerVideo(props);
  return null;
}

function render(props: Partial<Input> = {}) {
  act(() => {
    root.render(<Probe terminalId="t1" cli="claude" cwd={cwd} listed local={false} guest={false} {...props} />);
  });
}

beforeEach(() => {
  host.isMac = true;
  setup.ready = true;
  setup.asked = [];
  cwd = `/work/${++folders}`;
  useVideoAnswer.setState({ on: {} });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("useComposerVideo", () => {
  it("offers a video on another computer only where the agent lists the skill", () => {
    render({ listed: false });
    expect(video.available).toBe(false);
    render({ cli: null });
    expect(video.available).toBe(false);
  });

  it("always offers a video to an agent on this Mac", () => {
    render({ listed: false, local: true });
    expect(video.available).toBe(true);
    render({ cli: null, local: true });
    expect(video.available).toBe(false);
  });

  it("checks the setup before turning on on this Mac, and turns on once it's ready", async () => {
    render({ listed: false, local: true });
    await act(async () => video.toggle());
    expect(setup.asked).toEqual(["t1"]);
    expect(video.on).toBe(true);
    act(() => video.toggle());
    expect(video.on).toBe(false);
    expect(setup.asked).toEqual(["t1"]);
  });

  it("stays off while the setup window is up", async () => {
    setup.ready = false;
    render({ listed: false, local: true });
    await act(async () => video.toggle());
    expect(video.on).toBe(false);
  });

  it("keeps offering it once the command list empties on blur", () => {
    render({ listed: true });
    expect(video.available).toBe(true);
    render({ listed: false });
    expect(video.available).toBe(true);
  });

  it("never offers it to a guest at a shared tab", () => {
    render({ guest: true });
    expect(video.available).toBe(false);
  });

  it("wraps the prompt while on, and only for its own terminal", () => {
    render();
    expect(video.wrap("Show checkout")).toBe("Show checkout");
    act(() => video.toggle());
    expect(video.on).toBe(true);
    expect(video.wrap("Show checkout")).toBe("/explaincast Show checkout");
    render({ terminalId: "t2" });
    expect(video.on).toBe(false);
    expect(video.wrap("Show checkout")).toBe("Show checkout");
  });

  it("hands long-lived callers a wrap that follows the mode", () => {
    render();
    const wrap = video.wrap;
    act(() => video.toggle());
    expect(video.wrap).toBe(wrap);
    expect(wrap("Hi")).toBe("/explaincast Hi");
    act(() => video.turnOff());
    expect(wrap("Hi")).toBe("Hi");
  });

  it("says why and stays off where this computer can't record", () => {
    host.isMac = false;
    render({ local: true });
    act(() => video.toggle());
    expect(video.offReason).toBe("Videos record on a Mac");
    expect(video.on).toBe(false);
    render();
    expect(video.offReason).toBeNull();
    expect(video.on).toBe(true);
  });
});
