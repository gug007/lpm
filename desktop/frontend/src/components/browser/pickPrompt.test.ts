import { describe, expect, it } from "vitest";
import { pickPromptText, type BrowserPick } from "./pickPrompt";

const element: BrowserPick = {
  kind: "element",
  url: "http://localhost:3000/pricing",
  title: "Pricing",
  tag: "button",
  selector: "main > div:nth-of-type(2) > button.plan-cta",
  text: "Choose Team",
  html: '<button class="plan-cta" type="button">',
  component: { framework: "React", names: ["PlanCard", "PricingPage"], file: "src/components/PlanCard.tsx", line: 42 },
  rect: { x: 412.4, y: 388, width: 180, height: 32 },
  viewport: { width: 1280, height: 800, scrollX: 0, scrollY: 0 },
  image: "iVBOR",
};

describe("pickPromptText", () => {
  it("describes an element with its picture, selector and component", () => {
    expect(pickPromptText(element, true)).toBe(
      [
        "[Image #1]",
        "Element picked in the browser on http://localhost:3000/pricing",
        '- Element: <button class="plan-cta" type="button"> "Choose Team"',
        "- Selector: main > div:nth-of-type(2) > button.plan-cta",
        "- Component: PlanCard in PricingPage (React), src/components/PlanCard.tsx:42",
        "- Box: 180×32 at (412, 388) in a 1280×800 viewport",
        "",
        "",
      ].join("\n"),
    );
  });

  it("leaves out what the page didn't give", () => {
    const bare: BrowserPick = { ...element, html: null, text: null, selector: null, component: null, image: null };
    expect(pickPromptText(bare, false)).toBe(
      [
        "Element picked in the browser on http://localhost:3000/pricing",
        "- Element: <button>",
        "- Box: 180×32 at (412, 388) in a 1280×800 viewport",
        "",
        "",
      ].join("\n"),
    );
  });

  it("names a component by its file alone when the framework gave no name", () => {
    const vue: BrowserPick = { ...element, component: { framework: "Vue", names: [], file: "/app/src/Plan.vue", line: null } };
    expect(pickPromptText(vue, false)).toContain("- Component: Vue, /app/src/Plan.vue\n");
  });

  it("describes an area by its box and what sits in it", () => {
    const area: BrowserPick = {
      ...element,
      kind: "area",
      tag: null,
      text: null,
      html: null,
      selector: "main > section.plans",
      component: null,
      rect: { x: 120, y: 80, width: 520, height: 300 },
    };
    expect(pickPromptText(area, true)).toBe(
      [
        "[Image #1]",
        "Area picked in the browser on http://localhost:3000/pricing",
        "- Box: 520×300 at (120, 80) in a 1280×800 viewport",
        "- Around: main > section.plans",
        "",
        "",
      ].join("\n"),
    );
  });
});
