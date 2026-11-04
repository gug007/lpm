// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { skippedSkillsText } from "../../peer/usePeerSync";
import { SyncPreviewModal, type SyncItem } from "./SyncPreviewModal";

vi.mock("../../../bridge/commands", () => ({ PeerSyncRun: vi.fn() }));
vi.mock("../../../bridge/runtime", () => ({ EventsOn: () => () => {} }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const item = (over: Partial<SyncItem>): SyncItem => ({
  kind: "skill",
  name: "deploy",
  direction: "toRemote",
  localMtime: 1,
  remoteMtime: 0,
  ...over,
});

let container: HTMLDivElement;
let root: Root;

function show(items: SyncItem[]) {
  act(() =>
    root.render(
      <SyncPreviewModal open peerName="Studio" slug="abcd1234" items={items} onClose={() => {}} onSynced={() => {}} />,
    ),
  );
}

describe("SyncPreviewModal", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("lists skills in a group of their own, by the name that runs them", () => {
    show([item({}), item({ name: "old", deleted: true })]);
    const text = document.body.textContent ?? "";
    expect(text).toContain("Skills");
    expect(text).toContain("/deploy");
    expect(text).toContain("/old");
    expect(document.querySelector('[title*="This skill was deleted"]')).not.toBeNull();
  });

  it("shows a skill kept out of Git with its project, apart from global skills", () => {
    show([item({ name: "web/lint", kind: "kept-skill" }), item({ name: "api/old", kind: "kept-skill", deleted: true })]);
    const text = document.body.textContent ?? "";
    expect(text).toContain("Skills kept out of Git");
    expect(text).toContain("/lint in web");
    expect(text).toContain("/old in api");
    expect(document.querySelector('[title*="This skill was deleted"]')).not.toBeNull();
  });

  it("names the skills that stay on one computer", () => {
    expect(skippedSkillsText(undefined)).toBeNull();
    expect(skippedSkillsText([])).toBeNull();
    expect(skippedSkillsText(["lint"])).toMatch(/^\/lint: a different skill has that name/);
    expect(skippedSkillsText(["lint", "ship"])).toMatch(/^\/lint, \/ship: different skills have those names/);
  });
});
