import { describe, expect, it } from "vitest";
import { kokoroVoiceName } from "./kokoroVoices";
import { CLOUD_PRICE, videoVoiceName } from "./videoVoice";

describe("video voice names", () => {
  it("spells a Kokoro voice's accent and sex out", () => {
    expect(kokoroVoiceName("af_heart")).toBe("Heart · American female");
    expect(kokoroVoiceName("bm_george")).toBe("George · British male");
    expect(kokoroVoiceName("jf_alpha")).toBe("Alpha · female");
    expect(kokoroVoiceName("custom")).toBe("custom");
  });

  it("names OpenAI's voices and marks the ones it recommends", () => {
    expect(videoVoiceName("openai", "marin")).toBe("Marin · recommended");
    expect(videoVoiceName("openai", "alloy")).toBe("Alloy");
    expect(videoVoiceName("local", "bf_emma")).toBe("Emma · British female");
  });

  it("prices the cloud voice in dollars", () => {
    expect(CLOUD_PRICE).toBe("≈ $0.02 a minute");
  });
});
