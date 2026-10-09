// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SETUP_VIDEO_URL } from "../../mobile/links";
import type { PhoneDevice } from "../../mobile/phoneStatus";
import type { PeerClient } from "../../peer/usePeerState";

const open = vi.hoisted(() => vi.fn());
vi.mock("../../../bridge/runtime", () => ({ BrowserOpenURL: (url: string) => open(url) }));

import { PhonesSection } from "./PhonesSection";

let container: HTMLDivElement;
let root: Root;

const phone: PhoneDevice = {
  id: "p1",
  name: "Work phone",
  phoneName: "iPhone",
  createdAt: 1,
  connected: false,
  route: null,
  lastSeen: 0,
  lastRoute: null,
};

const peer = { slug: "studio", alias: "Studio", host: "studio", port: 1, enabled: true, connected: true } as PeerClient;

function render(devices: PhoneDevice[], peers: PeerClient[] = []) {
  act(() =>
    root.render(
      <PhonesSection
        devices={devices}
        peers={peers}
        awayReady={false}
        pairing={false}
        settingUpAway={false}
        onSetUpAway={vi.fn()}
        onPairHere={vi.fn()}
        onPairPeer={vi.fn()}
        onRename={vi.fn()}
        onRevoke={vi.fn()}
      />,
    ),
  );
}

const header = () => container.querySelector("h2")!.parentElement!;
const buttonIn = (el: Element, text: string) =>
  [...el.querySelectorAll("button")].find((b) => b.textContent?.includes(text));

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  open.mockReset();
});

describe("PhonesSection setup video", () => {
  it("links the video from the heading until a device is paired", () => {
    render([]);
    const link = buttonIn(header(), "Setup video")!;
    expect(link.textContent).toBe("Setup video · 3:41");
    act(() => link.click());
    expect(open).toHaveBeenCalledWith(SETUP_VIDEO_URL);
  });

  it("keeps the link beside Pair a device when other machines are connected", () => {
    render([], [peer]);
    expect(buttonIn(header(), "Setup video")).toBeDefined();
    expect(buttonIn(header(), "Pair a device")).toBeDefined();
  });

  it("moves the link under the device list once one is paired", () => {
    render([phone]);
    expect(buttonIn(header(), "Setup video")).toBeUndefined();
    const footer = container.querySelector("p.mt-2")!;
    act(() => buttonIn(footer, "Setup video")!.click());
    expect(open).toHaveBeenCalledWith(SETUP_VIDEO_URL);
  });
});
