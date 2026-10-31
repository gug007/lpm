import type { ReactNode } from "react";
import type { SavedLayoutNode } from "../../savedLayouts";

function thumbNode(node: SavedLayoutNode, key: string): ReactNode {
  if (node.kind === "leaf") {
    return <span key={key} className="min-h-0 min-w-0 flex-1 rounded-[1px] bg-current opacity-45" />;
  }
  return (
    <span
      key={key}
      className={`flex min-h-0 min-w-0 flex-1 gap-px ${node.direction === "row" ? "flex-row" : "flex-col"}`}
    >
      <span className="flex min-h-0 min-w-0" style={{ flex: node.ratio }}>
        {thumbNode(node.a, `${key}a`)}
      </span>
      <span className="flex min-h-0 min-w-0" style={{ flex: 1 - node.ratio }}>
        {thumbNode(node.b, `${key}b`)}
      </span>
    </span>
  );
}

/** A layout drawn small: its panes, split the way they were saved. */
export function LayoutThumb({ node }: { node: SavedLayoutNode }) {
  return (
    <span
      aria-hidden
      className="flex h-[12px] w-[16px] shrink-0 rounded-[2px] border border-current p-px opacity-80"
    >
      {thumbNode(node, "r")}
    </span>
  );
}
