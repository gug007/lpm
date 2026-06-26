import { describe, it, expect } from "vitest";
import YAML from "yaml";
import { nestEntry } from "./src/actionsStructural";

function parse(s: string) {
  return YAML.parseDocument(s);
}

describe("CRITICAL: Cycle creation scenario", () => {
  it("nesting Build into Build:iOS creates a cycle with the same node object appearing twice", () => {
    const doc = parse(`
actions:
  Build:
    actions:
      iOS: {}
`);

    // Get the node object references before the operation
    const buildNodeBefore = doc.getIn(["actions", "Build"]);
    
    // Perform the operation that should create a cycle
    nestEntry(doc, "Build", "Build:iOS");

    // After the operation, check if the same node object appears in two places
    const buildNodeAfter = doc.getIn(["actions", "Build"]);
    const buildInIos = doc.getIn(["actions", "Build", "actions", "iOS", "actions", "Build"]);
    
    // Verify the cycle exists: same object in two locations
    expect(buildNodeAfter).toBe(buildInIos);
    
    // This confirms the finding: the same YAML node object appears twice in the tree
    console.log("CYCLE CREATED: Same node object at:");
    console.log("  1. actions.Build");
    console.log("  2. actions.Build.actions.iOS.actions.Build");
  });
});
