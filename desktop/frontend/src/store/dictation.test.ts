// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

const commands = vi.hoisted(() => ({
  VoiceToTextStart: vi.fn(),
  VoiceToTextStop: vi.fn(),
  VoiceToTextCancel: vi.fn(),
  VoiceToTextToggle: vi.fn(),
  SetClipboardText: vi.fn(),
}));
const listeners = vi.hoisted(() => [] as ((payload: unknown) => void)[]);

vi.mock("../../bridge/commands", () => commands);
vi.mock("../../bridge/runtime", () => ({
  EventsOnReady: async (_name: string, cb: (payload: unknown) => void) => {
    listeners.push(cb);
    return () => {};
  },
}));
vi.mock("../notifications/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { dictationLevel, useDictationStore } from "./dictation";
import { DICTATION_DELIVERED, captureDictationTarget } from "../dictation/insert";

const emit = (payload: Record<string, unknown>) => listeners.forEach((cb) => cb(payload));
const store = () => useDictationStore.getState();
const model = { id: "parakeet-tdt-v3", name: "Parakeet TDT v3", live: false, local: true };

function field(value = "") {
  const area = document.createElement("textarea");
  area.value = value;
  document.body.append(area);
  area.focus();
  area.setSelectionRange(value.length, value.length);
  return area;
}

async function recordInto(area: HTMLTextAreaElement | null) {
  await store().start(area ? captureDictationTarget(area) : null);
  emit({ event: "state", state: "preparing", model });
  emit({ event: "state", state: "recording", model });
}

beforeEach(() => {
  for (const fn of Object.values(commands)) fn.mockReset();
  commands.VoiceToTextStart.mockResolvedValue("api");
  commands.VoiceToTextStop.mockResolvedValue(undefined);
  commands.VoiceToTextCancel.mockResolvedValue(undefined);
  commands.SetClipboardText.mockResolvedValue(undefined);
  document.execCommand = () => false;
  document.body.innerHTML = "";
  store().dismiss();
});

describe("dictation store", () => {
  it("follows VoiceToText from preparing through recording", async () => {
    await store().start(null);
    expect(store().phase).toBe("connecting");
    emit({ event: "state", state: "preparing", model, progress: 0.4 });
    expect(store()).toMatchObject({ phase: "preparing", modelName: "Parakeet TDT v3", progress: 0.4 });
    emit({ event: "state", state: "recording", model });
    expect(store().phase).toBe("recording");
    expect(store().startedAt).not.toBeNull();
    emit({ event: "level", level: 0.6 });
    expect(dictationLevel()).toBe(0.6);
  });

  it("inserts the transcript into the field that had focus, and tells it", async () => {
    const area = field("Please");
    const told = vi.fn(() => area.value);
    area.addEventListener(DICTATION_DELIVERED, told);
    await recordInto(area);
    store().stop();
    expect(commands.VoiceToTextStop).toHaveBeenCalledOnce();
    expect(store().phase).toBe("transcribing");
    emit({ event: "state", state: "transcribing" });
    emit({ event: "transcript", text: "run the tests." });
    expect(area.value).toBe("Please run the tests.");
    expect(told).toHaveReturnedWith("Please run the tests.");
    expect(store().phase).toBe("idle");
    emit({ event: "state", state: "idle" });
    expect(store().phase).toBe("idle");
  });

  it("copies the transcript when there is no field to put it in", async () => {
    await recordInto(null);
    store().stop();
    emit({ event: "transcript", text: "Hello there." });
    expect(commands.SetClipboardText).toHaveBeenCalledWith("Hello there.");
  });

  it("shows an error, and the idle after it doesn't clear it", async () => {
    await recordInto(field());
    store().stop();
    emit({ event: "error", code: "no_speech", message: "No speech detected." });
    emit({ event: "state", state: "idle" });
    expect(store()).toMatchObject({ phase: "error", error: { code: "no_speech" } });
    store().cancel();
    expect(store().phase).toBe("idle");
  });

  it("cancels, and ignores what the cancelled session still sends", async () => {
    await recordInto(field());
    store().cancel();
    expect(commands.VoiceToTextCancel).toHaveBeenCalledOnce();
    expect(store().phase).toBe("idle");
    emit({ event: "transcript", text: "late words" });
    emit({ event: "state", state: "idle" });
    expect(store().phase).toBe("idle");
  });

  it("a cancelled session's idle doesn't end the next one", async () => {
    await recordInto(field());
    store().cancel();
    await store().start(null);
    emit({ event: "state", state: "idle" });
    expect(store().phase).toBe("connecting");
    emit({ event: "state", state: "preparing", model });
    emit({ event: "state", state: "recording", model });
    expect(store().phase).toBe("recording");
  });

  it("takes back a start the user cancelled while VoiceToText launched", async () => {
    let resolve!: (mode: string) => void;
    commands.VoiceToTextStart.mockReturnValue(new Promise((r) => (resolve = r)));
    const starting = store().start(null);
    await Promise.resolve();
    store().cancel();
    expect(commands.VoiceToTextCancel).not.toHaveBeenCalled();
    resolve("api");
    await starting;
    expect(commands.VoiceToTextCancel).toHaveBeenCalledOnce();
    expect(store().phase).toBe("idle");
  });

  it("falls back to VoiceToText's own recorder for a copy without the API", async () => {
    commands.VoiceToTextStart.mockResolvedValue("legacy");
    await store().start(null);
    expect(commands.VoiceToTextToggle).toHaveBeenCalledOnce();
    expect(store().phase).toBe("idle");
  });

  it("reports a start VoiceToText refused", async () => {
    await store().start(null);
    emit({ event: "error", code: "busy", message: "VoiceToText is already recording." });
    expect(store()).toMatchObject({ phase: "error", error: { code: "busy" } });
  });

  it("reports VoiceToText quitting mid-recording", async () => {
    await recordInto(field());
    emit({ event: "disconnected" });
    expect(store()).toMatchObject({ phase: "error", error: { code: "disconnected" } });
  });

  it("ignores events when this window isn't dictating", () => {
    emit({ event: "state", state: "recording", model });
    emit({ event: "transcript", text: "someone else's" });
    expect(store().phase).toBe("idle");
  });
});
