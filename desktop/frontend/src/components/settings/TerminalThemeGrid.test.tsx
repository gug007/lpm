// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { terminalThemeChoiceOf } from "../../terminalThemeChoice";
import { TerminalThemeGrid } from "./TerminalThemeGrid";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const card = (name: string) =>
  [...container.querySelectorAll<HTMLButtonElement>("button")].find((b) =>
    b.getAttribute("aria-label")?.startsWith(name),
  )!;

describe("TerminalThemeGrid", () => {
  it("marks the one theme in One theme mode", () => {
    const choice = terminalThemeChoiceOf({ terminalTheme: "nord" });
    act(() => root.render(<TerminalThemeGrid choice={choice} onPick={() => {}} onPreview={() => {}} />));
    expect(container.querySelectorAll("button")).toHaveLength(11);
    expect(card("Nord").getAttribute("aria-pressed")).toBe("true");
    expect(card("Dracula").getAttribute("aria-pressed")).toBe("false");
    expect(card("Nord").getAttribute("aria-label")).toBe("Nord");
  });

  it("badges the dark and light picks in Follow mode", () => {
    const choice = terminalThemeChoiceOf({
      terminalThemeMode: "follow",
      terminalThemeDark: "dracula",
      terminalThemeLight: "github-light",
    });
    act(() => root.render(<TerminalThemeGrid choice={choice} onPick={() => {}} onPreview={() => {}} />));
    expect(card("Dracula").getAttribute("aria-label")).toBe("Dracula, used in dark mode");
    expect(card("Dracula").textContent).toContain("Dark");
    expect(card("GitHub Light").getAttribute("aria-label")).toBe("GitHub Light, used in light mode");
    expect(card("GitHub Light").textContent).toContain("Light");
    expect(card("Nord").getAttribute("aria-pressed")).toBe("false");
  });

  it("picks on click and previews on hover", () => {
    const onPick = vi.fn();
    const onPreview = vi.fn();
    const choice = terminalThemeChoiceOf({});
    act(() => root.render(<TerminalThemeGrid choice={choice} onPick={onPick} onPreview={onPreview} />));
    act(() => card("Claude Light").dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
    expect(onPreview).toHaveBeenLastCalledWith("claude-light");
    act(() => card("Claude Light").click());
    expect(onPick).toHaveBeenCalledWith("claude-light");
    act(() => container.firstElementChild!.dispatchEvent(new MouseEvent("mouseout", { bubbles: true })));
    expect(onPreview).toHaveBeenLastCalledWith(null);
  });
});
