#!/usr/bin/env python3
"""Generate the lpm notification chimes as 44.1kHz mono 16-bit WAVs.

These reproduce the original frontend Web Audio tones (sounds.ts playTone):
a sine per tone whose gain starts at 0.15 and exponentially decays to 0.001
over the tone's duration. Tones are summed at their start offsets. Stdlib only.
"""
import math
import struct
import wave

SR = 44100
PEAK = 0.15
FLOOR = 0.001

# name -> list of (frequency_hz, start_s, duration_s) — matches sounds.ts.
CHIMES = {
    "done": [(880, 0.0, 0.15), (1320, 0.120, 0.20)],
    "waiting": [(660, 0.0, 0.12), (660, 0.200, 0.12)],
    "error": [(440, 0.0, 0.15), (330, 0.150, 0.25)],
}


def render(tones):
    total = max(start + dur for _, start, dur in tones)
    n = int(math.ceil(total * SR))
    buf = [0.0] * n
    for freq, start, dur in tones:
        s0 = int(start * SR)
        for i in range(int(dur * SR)):
            tau = i / SR
            env = PEAK * (FLOOR / PEAK) ** (tau / dur)
            buf[s0 + i] += env * math.sin(2 * math.pi * freq * tau)
    return buf


def write_wav(path, samples):
    with wave.open(path, "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        frames = bytearray()
        for s in samples:
            v = max(-1.0, min(1.0, s))
            frames += struct.pack("<h", int(v * 32767))
        w.writeframes(bytes(frames))


if __name__ == "__main__":
    import os

    here = os.path.dirname(os.path.abspath(__file__))
    for name, tones in CHIMES.items():
        out = os.path.join(here, f"{name}.wav")
        write_wav(out, render(tones))
        print(f"wrote {out}")
