import { useRef, useCallback } from "react";
import { PaneView, type PaneViewProps } from "./PaneView";
import type { PaneNode, PaneSplit } from "../paneTree";
import { firstPaneId } from "../paneTree";

export interface PaneLayoutProps extends Omit<PaneViewProps, "pane" | "focused" | "fullscreen"> {
  node: PaneNode;
  focusedPaneId: string | null;
  fullscreenPaneId: string | null;
  onRatioChange: (path: number[], ratio: number) => void;
  path?: number[];
  // services are only rendered on the first leaf in the whole tree.
  // Nested calls compute this once at the root and propagate the id down
  // so inner PaneLayouts don't need to walk the tree again.
  primaryPaneId?: string;
}

export function PaneLayout(props: PaneLayoutProps) {
  const { node, path = [], focusedPaneId, fullscreenPaneId, services, primaryPaneId } = props;
  const rootPrimaryId = primaryPaneId ?? firstPaneId(node);

  if (node.kind === "leaf") {
    return (
      <PaneView
        {...props}
        pane={node}
        focused={focusedPaneId === node.id}
        fullscreen={fullscreenPaneId === node.id}
        services={node.id === rootPrimaryId ? services : undefined}
      />
    );
  }

  return <SplitView {...props} split={node} path={path} primaryPaneId={rootPrimaryId} />;
}

interface SplitViewProps extends PaneLayoutProps {
  split: PaneSplit;
}

function SplitView({ split, path = [], onRatioChange, primaryPaneId, ...rest }: SplitViewProps) {
  const { direction, ratio, a, b } = split;
  const containerRef = useRef<HTMLDivElement>(null);
  const isRow = direction === "row";

  const onDividerDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const total = isRow ? rect.width : rect.height;
      if (total <= 0) return;
      const origin = isRow ? rect.left : rect.top;

      // rAF-throttle: coalesce multiple mousemoves per frame into one
      // tree update so a fast drag doesn't re-render the whole pane tree
      // at 1kHz.
      let rafId = 0;
      let pendingPos = 0;
      const onMove = (ev: MouseEvent) => {
        pendingPos = isRow ? ev.clientX : ev.clientY;
        if (rafId) return;
        rafId = requestAnimationFrame(() => {
          rafId = 0;
          onRatioChange(path, (pendingPos - origin) / total);
        });
      };
      const onUp = () => {
        if (rafId) cancelAnimationFrame(rafId);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
      };
      document.body.style.userSelect = "none";
      document.body.style.cursor = isRow ? "col-resize" : "row-resize";
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [isRow, path, onRatioChange],
  );

  const dim = isRow ? "width" : "height";
  const aStyle = { [dim]: `${ratio * 100}%` } as React.CSSProperties;
  const bStyle = { [dim]: `${(1 - ratio) * 100}%` } as React.CSSProperties;

  const dividerClass = `shrink-0 bg-[var(--bg-sidebar)] hover:bg-[var(--accent-cyan)] transition-colors ${
    isRow ? "w-[3px] cursor-col-resize" : "h-[3px] cursor-row-resize"
  }`;

  return (
    <div
      ref={containerRef}
      className={`flex min-h-0 min-w-0 flex-1 overflow-hidden ${isRow ? "flex-row" : "flex-col"}`}
    >
      <div className="flex min-h-0 min-w-0 overflow-hidden" style={aStyle}>
        <PaneLayout {...rest} node={a} path={[...path, 0]} onRatioChange={onRatioChange} primaryPaneId={primaryPaneId} />
      </div>
      <div onMouseDown={onDividerDown} className={dividerClass} />
      <div className="flex min-h-0 min-w-0 overflow-hidden" style={bStyle}>
        <PaneLayout {...rest} node={b} path={[...path, 1]} onRatioChange={onRatioChange} primaryPaneId={primaryPaneId} />
      </div>
    </div>
  );
}
