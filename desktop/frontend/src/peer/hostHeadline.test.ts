import { describe, expect, it } from "vitest";
import { hostHeadline } from "./hostHeadline";
import { machineWords } from "../machineWords";

const words = machineWords(true);
const host = { enabled: true, running: true, guestsOnly: false, port: 8766 };

describe("hostHeadline", () => {
  it("says who can still get in while control is off", () => {
    expect(hostHeadline({ ...host, enabled: false }, true, false, words).text).toBe(
      "Off · turn on to let another Mac connect",
    );
    expect(hostHeadline({ ...host, enabled: false, guestsOnly: true }, true, false, words).text).toBe(
      "Off · only people you let into a shared tab can reach this Mac",
    );
  });

  it("names the port it is waiting for", () => {
    expect(hostHeadline({ ...host, running: false }, true, false, words)).toEqual({
      tone: "pending",
      text: "Waiting for port 8766 — another copy of lpm may be using it",
    });
  });

  it("says how far it reaches", () => {
    expect(hostHeadline(host, false, false, words).text).toBe("On · works on this network only");
    expect(hostHeadline(host, true, false, words).text).toBe(
      "On · works anywhere once your other Macs are on Tailscale",
    );
    expect(hostHeadline(host, true, true, words).text).toBe("On · your Macs reach this Mac from anywhere");
  });
});
