import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ZoneInfo } from "../../types";
import { DisplayPicker } from "./DisplayPicker";

const zones: ZoneInfo[] = [
  { name: "build", label: "Build", rows: 2, source: "project" },
  { name: "ship", label: "Ship", rows: 2, display: "footer", source: "project" },
];

describe("DisplayPicker", () => {
  it("names the row a zone sits in", () => {
    const markup = (display: string) => renderToStaticMarkup(<DisplayPicker display={display} zones={zones} onChange={() => {}} />);
    expect(markup("ship")).toContain("In the Ship zone of the footer row.");
    expect(markup("build")).toContain("In the Build zone of the header row.");
  });
});
