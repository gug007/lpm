import { FileViewerModal } from "./FileViewerModal";
import { useFileViewerStore } from "../store/fileViewer";

export function FileViewerHost() {
  const current = useFileViewerStore((s) => s.current);
  const close = useFileViewerStore((s) => s.close);

  return (
    <FileViewerModal
      open={current !== null}
      absPath={current?.absPath ?? ""}
      line={current?.line ?? 0}
      col={current?.col ?? 0}
      projectRoot={current?.projectRoot ?? ""}
      onClose={close}
    />
  );
}
