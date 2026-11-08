import { describe, expect, it, vi } from "vitest";
import { mergedOfferText, offeredCopies, removeCopiesLabel } from "./mergedCopies";
import { prefixName } from "./peer/markers";
import type { MergedCopy } from "./store/mergedCopies";
import type { ProjectInfo } from "./types";

vi.mock("../bridge/commands", () => ({ BranchPullRequest: vi.fn(), GitChangedFiles: vi.fn() }));

const project = (name: string, parentName?: string) => ({ name, root: `/${name}`, parentName }) as ProjectInfo;
const merged = (over: Partial<MergedCopy> = {}): MergedCopy => ({ number: 7, title: "t", clean: true, ...over });
const offer = (
  projects: ProjectInfo[],
  entries: Record<string, MergedCopy>,
  dismissed: Record<string, number> = {},
  skip: (p: ProjectInfo) => boolean = () => false,
) => offeredCopies(projects, { entries, dismissed, skip }).map((p) => p.name);

describe("offeredCopies", () => {
  const copy = project("app-2", "app");

  it("offers a clean merged copy", () => {
    expect(offer([copy], { "/app-2": merged() })).toEqual(["app-2"]);
  });

  it("never offers a copy with uncommitted work", () => {
    expect(offer([copy], { "/app-2": merged({ clean: false }) })).toEqual([]);
  });

  it("never offers an original, even one whose branch merged", () => {
    expect(offer([project("app")], { "/app": merged() })).toEqual([]);
  });

  it("stops offering a dismissed copy, until a later pull request merges", () => {
    expect(offer([copy], { "/app-2": merged() }, { "app-2": 7 })).toEqual([]);
    expect(offer([copy], { "/app-2": merged({ number: 8 }) }, { "app-2": 7 })).toEqual(["app-2"]);
  });

  it("leaves out a copy being skipped", () => {
    expect(offer([copy], { "/app-2": merged() }, {}, () => true)).toEqual([]);
  });

  it("offers one computer at a time, this one first", () => {
    const remote = project(prefixName("abcd1234", "app-2"), prefixName("abcd1234", "app"));
    const entries = { "/app-2": merged(), [remote.root]: merged() };
    expect(offer([remote, copy], entries)).toEqual(["app-2"]);
    expect(offer([remote], entries)).toEqual([remote.name]);
  });
});

describe("offer text", () => {
  const two = [project("a-2", "a"), project("a-3", "a")];

  it("names the original when the copies share one", () => {
    expect(mergedOfferText(two, "saas-app")).toBe("2 copies of saas-app are merged.");
    expect(mergedOfferText(two.slice(1), "saas-app")).toBe("1 copy of saas-app is merged.");
  });

  it("counts them when they don't", () => {
    expect(mergedOfferText(two, null)).toBe("2 copies are merged.");
  });

  it("labels the button", () => {
    expect(removeCopiesLabel(2)).toBe("Remove 2 copies");
    expect(removeCopiesLabel(1)).toBe("Remove 1 copy");
  });
});
