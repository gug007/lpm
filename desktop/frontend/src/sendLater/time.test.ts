import { describe, expect, it } from "vitest";
import {
  HOUR,
  MINUTE,
  clockLabel,
  countdownLabel,
  dayLabel,
  parseWhen,
  readbackLabel,
  scheduleButtonLabel,
  shortWhenLabel,
} from "./time";

// Thursday, September 24, 2026, 2:48 PM local time.
const NOW = new Date(2026, 8, 24, 14, 48).getTime();
const at = (day: number, h: number, m = 0) => new Date(2026, 8, day, h, m).getTime();

describe("parseWhen", () => {
  it("reads delays", () => {
    expect(parseWhen("2h", NOW)).toBe(NOW + 2 * HOUR);
    expect(parseWhen("90m", NOW)).toBe(NOW + 90 * MINUTE);
    expect(parseWhen("2h 15m", NOW)).toBe(NOW + 2 * HOUR + 15 * MINUTE);
    expect(parseWhen("in 2 hours", NOW)).toBe(NOW + 2 * HOUR);
    expect(parseWhen("45 min", NOW)).toBe(NOW + 45 * MINUTE);
    expect(parseWhen("1.5h", NOW)).toBe(NOW + 90 * MINUTE);
    expect(parseWhen("1 hour and 30 minutes", NOW)).toBe(NOW + 90 * MINUTE);
  });

  it("reads clock times, rolling a past one to tomorrow", () => {
    expect(parseWhen("5pm", NOW)).toBe(at(24, 17));
    expect(parseWhen("7:30 pm", NOW)).toBe(at(24, 19, 30));
    expect(parseWhen("17:30", NOW)).toBe(at(24, 17, 30));
    expect(parseWhen("at 5:00 PM", NOW)).toBe(at(24, 17));
    expect(parseWhen("9 am", NOW)).toBe(at(25, 9));
    expect(parseWhen("noon", NOW)).toBe(at(25, 12));
  });

  it("gives an hour without am/pm its next reading", () => {
    expect(parseWhen("5", NOW)).toBe(at(24, 17));
    expect(parseWhen("3:00", NOW)).toBe(at(24, 15));
    expect(parseWhen("2", NOW)).toBe(at(25, 2));
  });

  it("reads days, with or without a time", () => {
    expect(parseWhen("tomorrow", NOW)).toBe(at(25, 9));
    expect(parseWhen("tomorrow 9", NOW)).toBe(at(25, 9));
    expect(parseWhen("tomorrow 3", NOW)).toBe(at(25, 15));
    expect(parseWhen("tomorrow at 10:30am", NOW)).toBe(at(25, 10, 30));
    expect(parseWhen("fri 10am", NOW)).toBe(at(25, 10));
    expect(parseWhen("monday", NOW)).toBe(at(28, 9));
    expect(parseWhen("today 6pm", NOW)).toBe(at(24, 18));
  });

  it("moves a weekday whose time has passed to next week", () => {
    expect(parseWhen("thu 9am", NOW)).toBe(new Date(2026, 9, 1, 9).getTime());
    expect(parseWhen("thursday 6pm", NOW)).toBe(at(24, 18));
  });

  it("refuses what names no moment ahead", () => {
    expect(parseWhen("", NOW)).toBeNull();
    expect(parseWhen("soon", NOW)).toBeNull();
    expect(parseWhen("today 9am", NOW)).toBeNull();
    expect(parseWhen("25:00", NOW)).toBeNull();
    expect(parseWhen("13pm", NOW)).toBeNull();
    expect(parseWhen("0m", NOW)).toBeNull();
    expect(parseWhen("500h", NOW)).not.toBeNull();
    expect(parseWhen("5000h", NOW)).toBeNull();
    expect(parseWhen("2h tomorrow", NOW)).toBeNull();
  });
});

describe("labels", () => {
  it("names the day relative to now", () => {
    expect(dayLabel(at(24, 17), NOW)).toBe("Today");
    expect(dayLabel(at(25, 9), NOW)).toBe("Tomorrow");
    expect(dayLabel(at(26, 9), NOW)).not.toMatch(/Today|Tomorrow/);
  });

  it("reads back a day, a time and a countdown", () => {
    expect(readbackLabel(NOW + 2 * HOUR, NOW)).toBe(`Today ${clockLabel(NOW + 2 * HOUR)} · in 2h`);
    expect(countdownLabel(at(24, 17), NOW)).toBe("in 2h 12m");
    expect(countdownLabel(NOW + 10_000, NOW)).toBe("now");
  });

  it("names the day on the button only when it isn't today", () => {
    expect(scheduleButtonLabel(at(24, 17), NOW)).toBe(`Schedule for ${clockLabel(at(24, 17))}`);
    expect(scheduleButtonLabel(at(25, 9), NOW)).toBe(`Schedule for tomorrow ${clockLabel(at(25, 9))}`);
    expect(scheduleButtonLabel(at(26, 9), NOW)).toContain(clockLabel(at(26, 9)));
  });

  it("keeps a mark short for today", () => {
    expect(shortWhenLabel(at(24, 17), NOW)).toBe(clockLabel(at(24, 17)));
    expect(shortWhenLabel(at(25, 9), NOW)).toBe(`Tomorrow ${clockLabel(at(25, 9))}`);
  });
});
