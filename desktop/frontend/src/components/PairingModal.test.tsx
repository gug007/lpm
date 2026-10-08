// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PairingModal, type Pairing } from "./PairingModal";

const pairing = (hosts: string[]): Pairing => ({
  code: "AB12-CD34",
  url: "lpm://pair",
  svg: "<svg></svg>",
  host: hosts[0],
  hosts,
  port: 8765,
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function button(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === label);
}

describe("PairingModal", () => {
  it("holds back a code that only works on this network until the user agrees", async () => {
    act(() => root.render(<PairingModal pairing={pairing(["192.168.1.20"])} onClose={() => {}} />));
    expect(document.body.textContent).toContain("This code won't work away from home");
    expect(document.body.textContent).not.toContain("AB12-CD34");
    await act(async () => button("Pair for this network only")!.click());
    expect(document.body.textContent).toContain("AB12-CD34");
  });

  it("shows a code that works from anywhere straight away", () => {
    act(() => root.render(<PairingModal pairing={pairing(["192.168.1.20", "100.64.0.12"])} onClose={() => {}} />));
    expect(document.body.textContent).toContain("AB12-CD34");
    expect(document.body.textContent).not.toContain("This code won't work away from home");
  });

  it("offers setting up Tailscale instead", async () => {
    const setUp = vi.fn();
    act(() =>
      root.render(<PairingModal pairing={pairing(["192.168.1.20"])} onClose={() => {}} onSetUpTailscale={setUp} />),
    );
    await act(async () => button("Set up Tailscale")!.click());
    expect(setUp).toHaveBeenCalledOnce();
  });
});
