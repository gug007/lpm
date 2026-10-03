import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { RowContextMenu } from "./RowContextMenu";

type Props = Parameters<typeof RowContextMenu>[0];
type Found = ReactElement<{ label?: ReactNode; onClick?: () => void; children?: ReactNode }>;

// RowContextMenu holds no state, so calling it returns its element tree.
function rows(props: Props): Found[] {
  const found: Found[] = [];
  const walk = (node: ReactNode) => {
    if (Array.isArray(node)) node.forEach(walk);
    else if (isValidElement<Found["props"]>(node)) {
      if (node.props.label !== undefined) found.push(node);
      walk(node.props.children);
    }
  };
  walk(RowContextMenu(props));
  return found;
}

const props = (extra: Partial<Props> = {}): Props => ({
  x: 1,
  y: 2,
  row: "footer",
  onNewAction: vi.fn(),
  onCreateZone: vi.fn(),
  onClose: vi.fn(),
  ...extra,
});

describe("RowContextMenu", () => {
  it("offers a new action and a new zone", () => {
    expect(rows(props()).map((row) => row.props.label)).toEqual(["New action", "Create zone…"]);
  });

  it("runs the pick, then closes", () => {
    const p = props();
    rows(p).find((row) => row.props.label === "Create zone…")?.props.onClick?.();
    expect(p.onCreateZone).toHaveBeenCalledOnce();
    expect(p.onClose).toHaveBeenCalledOnce();
    rows(p).find((row) => row.props.label === "New action")?.props.onClick?.();
    expect(p.onNewAction).toHaveBeenCalledOnce();
  });
});
