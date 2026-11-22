// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UsageProviderCard } from "./UsageProviderCard";
import type { ProviderLimits } from "../hooks/useAgentLimits";

const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

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

const reading = (ageMs: number): ProviderLimits => ({
  provider: "claude",
  accountId: "default",
  weekly: { usedPercent: 100, resetsAt: Math.floor(NOW / 1000) + 3600 },
  noFiveHour: true,
  updatedAt: NOW - ageMs,
});

describe("UsageProviderCard with an old reading", () => {
  it("says how old the reading is in place of the number, with Read it now", () => {
    const onRead = vi.fn();
    act(() =>
      root.render(
        <UsageProviderCard data={reading(DAY)} now={NOW} title="Claude" reader={{ busy: false, onRead }} />,
      ),
    );
    const text = container.textContent ?? "";
    expect(text).toContain("Last read 1 day ago");
    expect(text).toContain("Weekly was 100% then.");
    expect(text).not.toContain("limit reached");
    const button = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Read it now"));
    act(() => button!.click());
    expect(onRead).toHaveBeenCalledOnce();
  });

  it("keeps the meters for a recent reading", () => {
    act(() => root.render(<UsageProviderCard data={reading(5 * 60 * 1000)} now={NOW} title="Claude" />));
    expect(container.textContent).toContain("limit reached");
    expect(container.textContent).not.toContain("Last read");
  });

  it("shows why a read failed", () => {
    act(() =>
      root.render(
        <UsageProviderCard
          data={reading(DAY)}
          now={NOW}
          title="Claude"
          reader={{ busy: false, error: "This account isn't signed in.", onRead: () => {} }}
        />,
      ),
    );
    expect(container.textContent).toContain("This account isn't signed in.");
  });
});
