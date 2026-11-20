import { describe, expect, it } from "vitest";
import { kokoroVoiceName } from "./kokoroVoices";
import { videoVoiceName, videoVoiceSummary } from "./videoVoice";

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

  it("sums a voice up as its name, where it runs and what it costs", () => {
    expect(videoVoiceSummary({ narrator: "openai", voice: "marin" })).toEqual({
      name: "Marin",
      where: "OpenAI",
      cost: "$0.02/min",
    });
    expect(videoVoiceSummary({ narrator: "local", voice: "af_heart" })).toEqual({
      name: "Heart",
      where: "this Mac",
      cost: "free",
    });
  });
});
