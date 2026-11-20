// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAnswerMode } from "../store/answerMode";
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
const mode = () => useAnswerMode.getState().modes.t1;
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
  useAnswerMode.setState({ modes: {} });
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
    expect(mode()).toBe("video");
    act(() => video.toggle());
    expect(mode()).toBeUndefined();
    expect(setup.asked).toEqual(["t1"]);
  });

  it("stays off while the setup window is up", async () => {
    setup.ready = false;
    render({ listed: false, local: true });
    await act(async () => video.toggle());
    expect(mode()).toBeUndefined();
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

  it("says why where this computer can't record", () => {
    host.isMac = false;
    render({ local: true });
    expect(video.offReason).toBe("Videos record on a Mac");
    render();
    expect(video.offReason).toBeNull();
  });
});
