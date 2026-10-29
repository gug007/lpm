// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  addSshHost: vi.fn(),
  peerState: vi.fn(),
  addProjectForPeer: vi.fn(),
}));

vi.mock("../store/app", () => ({
  useAppStore: (select: (state: unknown) => unknown) => select(mocks),
}));
vi.mock("../../bridge/commands", () => ({
  PeerAddSshHost: mocks.addSshHost,
  PeerState: mocks.peerState,
}));

import { InstallLpmScreen } from "./InstallLpmScreen";

let container: HTMLDivElement;
let root: Root;

function type(text: string) {
  const input = container.querySelector("input")!;
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setValue.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function connect() {
  await act(async () => container.querySelector("button")!.click());
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<InstallLpmScreen />));
  mocks.addSshHost.mockResolvedValue({ slug: "peer-1" });
  mocks.peerState.mockResolvedValue({ peers: [{ slug: "peer-1", alias: "build-box", host: "10.0.0.5" }] });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

describe("InstallLpmScreen", () => {
  it("installs lpm over SSH, then opens the picker on the paired server", async () => {
    type("deploy@10.0.0.5");
    await connect();

    expect(mocks.addSshHost).toHaveBeenCalledWith({ host: "10.0.0.5", user: "deploy", port: 0, key: "" }, "", true);
    expect(mocks.addProjectForPeer).toHaveBeenCalledWith("peer-1", "build-box", true);
  });

  it("pairs with an lpm already there when told not to install it", async () => {
    type("deploy@10.0.0.5");
    act(() => container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    await connect();

    expect(mocks.addSshHost).toHaveBeenCalledWith({ host: "10.0.0.5", user: "deploy", port: 0, key: "" }, "", false);
  });

  it("does not connect until the field holds a server", async () => {
    type("not a host");
    await connect();

    expect(mocks.addSshHost).not.toHaveBeenCalled();
  });

  it("shows the error and stays put when pairing fails", async () => {
    mocks.addSshHost.mockRejectedValue("lpm couldn't reach 10.0.0.5");
    type("deploy@10.0.0.5");
    await connect();

    expect(container.textContent).toContain("lpm couldn't reach 10.0.0.5");
    expect(mocks.addProjectForPeer).not.toHaveBeenCalled();
  });

  it("leaves the picker alone when the screen is gone before pairing finishes", async () => {
    let finish: (v: { slug: string }) => void = () => {};
    mocks.addSshHost.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    type("deploy@10.0.0.5");
    await connect();

    act(() => root.render(<></>));
    await act(async () => finish({ slug: "peer-1" }));

    expect(mocks.addProjectForPeer).not.toHaveBeenCalled();
  });
});
