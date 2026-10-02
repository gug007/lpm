import { useEffect, useState } from "react";
import { NotesReadFileAsInput } from "../../bridge/commands";
import { base64ToBytes, bytesToBlobUrl } from "../download";
import { useContentZoom, type ContentZoom } from "../hooks/useContentZoom";
import { isPeerMarked } from "../peer/markers";
import { formatBytes } from "../syncApi";
import { IMAGE_PREVIEW_MAX_BYTES } from "./imagePreview";

// A file on this Mac crosses only the local IPC bridge; one on a paired Mac
// comes over its WebSocket as a single frame, held to the image preview's cap.
const LOCAL_MAX_BYTES = 64 * 1024 * 1024;

// The header may sit anywhere in the first kilobyte, after junk some writers emit.
const HEADER_WINDOW = 1024;

export interface PdfPreview {
  // A blob URL for the PDF, alive while this preview shows it.
  src: string | null;
  error: string | null;
  meta: string | null;
  // 100% is the viewer's own fit to the width it is given.
  zoom: ContentZoom;
}

function looksLikePdf(data: Uint8Array): boolean {
  return String.fromCharCode(...data.subarray(0, HEADER_WINDOW)).includes("%PDF-");
}

// The bytes are read the same way from this Mac or a paired one, then shown by
// the PDF viewer WebKit has on macOS: Preview's rendering, text selection and
// zoom, without shipping a PDF engine.
export function usePdfPreview(path: string, active: boolean): PdfPreview {
  const [src, setSrc] = useState<string | null>(null);
  const [bytes, setBytes] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const zoom = useContentZoom(active);

  const { zoomReset } = zoom;
  useEffect(() => {
    setSrc(null);
    setBytes(0);
    setError(null);
    zoomReset();
    if (!active || !path) return;
    let cancelled = false;
    let url: string | null = null;
    const cap = isPeerMarked(path) ? IMAGE_PREVIEW_MAX_BYTES : LOCAL_MAX_BYTES;
    NotesReadFileAsInput(path, cap).then(
      (input: { data: string }) => {
        if (cancelled) return;
        const data = base64ToBytes(input.data);
        setBytes(data.byteLength);
        // The viewer draws a non-PDF as a blank page; say what's wrong instead.
        if (!looksLikePdf(data)) {
          setError("This file isn't a readable PDF.");
          return;
        }
        url = bytesToBlobUrl(data, "application/pdf");
        setSrc(url);
      },
      (err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      },
    );
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [path, active, zoomReset]);

  return { src, error, meta: bytes > 0 ? formatBytes(bytes) : null, zoom };
}
