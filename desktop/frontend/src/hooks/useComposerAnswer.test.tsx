// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAnswerMode } from "../store/answerMode";
import { useComposerAnswer } from "./useComposerAnswer";

vi.mock("../store/videoSetup", () => ({ ensureVideoReady: async () => true }));
const host = vi.hoisted(() => ({ isMac: true }));
vi.mock("../platform", () => ({
  get isMac() {
    return host.isMac;
  },
}));

type Input = Parameters<typeof useComposerAnswer>[0];
type Answer = ReturnType<typeof useComposerAnswer>;

let container: HTMLDivElement;
let root: Root;
let answer: Answer;

function Probe(props: Input) {
  answer = useComposerAnswer(props);
  return null;
}

function render(props: Partial<Input> = {}) {
  act(() => {
    root.render(
      <Probe terminalId="t1" cli="claude" cwd="/work" listed local={false} guest={false} ssh={false} {...props} />,
    );
  });
}

beforeEach(() => {
  host.isMac = true;
  useAnswerMode.setState({ modes: {} });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("useComposerAnswer", () => {
  it("offers an image wherever an agent runs, but not to a guest or a shell", () => {
    render();
    expect(answer.tools.image).not.toBeNull();
    render({ guest: true });
    expect(answer.tools.image).toBeNull();
    render({ cli: null });
    expect(answer.tools.image).toBeNull();
  });

  it("asks for an image with lpm generate, and only for its own terminal", () => {
    render();
    act(() => answer.tools.image!.onToggle());
    expect(answer.kind).toBe("image");
    expect(answer.tools.image!.on).toBe(true);
    expect(answer.wrap("A logo for the app")).toBe("Make an image with `lpm generate image`: A logo for the app");
    render({ terminalId: "t2" });
    expect(answer.kind).toBeNull();
    expect(answer.wrap("Hi")).toBe("Hi");
  });

  it("keeps one answer kind at a time", () => {
    render();
    act(() => answer.tools.video!.onToggle());
    expect(answer.kind).toBe("video");
    expect(answer.wrap("Show checkout")).toBe("/explaincast Show checkout");
    act(() => answer.tools.image!.onToggle());
    expect(answer.kind).toBe("image");
    expect(answer.tools.video!.on).toBe(false);
    act(() => answer.tools.image!.onToggle());
    expect(answer.kind).toBeNull();
  });

  it("hands long-lived callers a wrap that follows the mode", () => {
    render();
    const wrap = answer.wrap;
    act(() => answer.tools.image!.onToggle());
    expect(answer.wrap).toBe(wrap);
    expect(wrap("Hi")).toBe("Make an image with `lpm generate image`: Hi");
    act(() => answer.turnOff());
    expect(wrap("Hi")).toBe("Hi");
  });

  it("says why and stays off in an SSH project", () => {
    render({ ssh: true });
    expect(answer.tools.image!.offReason).toBe("Not available in SSH projects");
    act(() => answer.tools.image!.onToggle());
    expect(answer.kind).toBeNull();
    expect(answer.wrap("Hi")).toBe("Hi");
  });

  it("keeps a video asked for where it can't record from going out", () => {
    host.isMac = false;
    render({ local: true });
    useAnswerMode.getState().setMode("t1", "video");
    render({ local: true });
    expect(answer.tools.video!.offReason).toBe("Videos record on a Mac");
    expect(answer.kind).toBeNull();
    expect(answer.wrap("Hi")).toBe("Hi");
  });
});
