// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StatusLineAppearanceSettings } from "./StatusLineAppearanceSettings";
import type { CustomSpec } from "./statusLineTypes";

const baseSpec: CustomSpec = {
  segments: [
    { id: "folder", color: "default", text: "" },
    { id: "five", color: "default", text: "" },
  ],
  separator: "·",
  meterStyle: "bar",
  meterWidth: 7,
  icons: true,
  gitStatus: false,
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function renderAppearance(
  spec: CustomSpec,
  onChange = vi.fn(),
  disabled = false,
) {
  await act(async () => {
    root.render(
      <StatusLineAppearanceSettings
        spec={spec}
        disabled={disabled}
        onChange={onChange}
      />,
    );
  });
  return onChange;
}

function buttonWithText(text: string): HTMLButtonElement {
  const button = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent?.includes(text),
  );
  if (!button) throw new Error(`${text} button not found`);
  return button;
}

describe("StatusLineAppearanceSettings", () => {
  it("keeps every compact appearance control interactive", async () => {
    const onChange = await renderAppearance(baseSpec);

    await act(async () => buttonWithText("Show icons").click());
    expect(onChange).toHaveBeenCalledWith({ ...baseSpec, icons: false });

    const separator = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Use | as separator"]',
    );
    await act(async () => separator?.click());
    expect(onChange).toHaveBeenCalledWith({ ...baseSpec, separator: "|" });

    await act(async () => buttonWithText("Blocks").click());
    expect(onChange).toHaveBeenCalledWith({
      ...baseSpec,
      meterStyle: "blocks",
    });

    const wider = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Make meter wider"]',
    );
    await act(async () => wider?.click());
    expect(onChange).toHaveBeenCalledWith({ ...baseSpec, meterWidth: 8 });
  });

  it("hides usage controls without a meter and shows Git status for a branch", async () => {
    await renderAppearance({
      ...baseSpec,
      segments: [
        { id: "folder", color: "default", text: "" },
        { id: "branch", color: "default", text: "" },
      ],
    });

    expect(container.textContent).not.toContain("Usage display");
    expect(container.textContent).toContain("Show Git status");
    expect(
      container.querySelector('[aria-label="Meter width controls"]'),
    ).toBeNull();
  });

  it("hides meter width for Number and keeps separator errors visible", async () => {
    await renderAppearance({
      ...baseSpec,
      separator: "",
      meterStyle: "percent",
    });

    expect(buttonWithText("Number").getAttribute("aria-pressed")).toBe("true");
    expect(
      container.querySelector('[aria-label="Meter width controls"]'),
    ).toBeNull();
    expect(
      container.querySelector<HTMLInputElement>(
        'input[aria-label="Custom separator"]',
      )?.getAttribute("aria-invalid"),
    ).toBe("true");
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });
});
