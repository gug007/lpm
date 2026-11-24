import { useEffect } from "react";
import { useResizableWidth } from "../hooks/useResizableWidth";
import { FileViewerModal } from "./FileViewerModal";
import { useFileViewerStore } from "../store/fileViewer";

const DOCK_WIDTH_KEY = "lpm:fileViewerDockWidth";

export function FileViewerHost() {
  const current = useFileViewerStore((s) => s.current);
  const mode = useFileViewerStore((s) => s.mode);
  const close = useFileViewerStore((s) => s.close);
  const setMode = useFileViewerStore((s) => s.setMode);
  const setDockInset = useFileViewerStore((s) => s.setDockInset);
  const dock = useResizableWidth({
    initial: 460,
    min: 320,
    max: 960,
    edge: "left",
    storageKey: DOCK_WIDTH_KEY,
  });

  const docked = current !== null && mode === "docked";
  useEffect(() => setDockInset(docked ? dock.width : 0), [docked, dock.width, setDockInset]);

  return (
    <FileViewerModal
      open={current !== null}
      absPath={current?.absPath ?? ""}
      line={current?.line ?? 0}
      col={current?.col ?? 0}
      projectRoot={current?.projectRoot ?? ""}
      onHost={current?.onHost}
      choices={current?.choices}
      overDialog={current?.overDialog}
      layout={{
        mode,
        dockWidth: dock.width,
        onModeChange: setMode,
        onDockResizeStart: dock.handleResizeStart,
      }}
      onClose={close}
    />
  );
}
