import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NewActionChooser } from "./NewActionChooser";

describe("NewActionChooser", () => {
  it("focuses the Action button so Enter opens the form", () => {
    const markup = renderToStaticMarkup(<NewActionChooser onAction={() => {}} onZone={() => {}} />);
    const buttons = markup.match(/<button\b[^>]*>/g) ?? [];
    expect(buttons[0]).toContain("autofocus");
    expect(buttons.filter((button) => button.includes("autofocus"))).toHaveLength(1);
  });
});
