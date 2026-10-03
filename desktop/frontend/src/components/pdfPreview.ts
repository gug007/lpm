import { useEffect, useState } from "react";
import { NotesReadFileAsInput } from "../../bridge/commands";
import { base64ToBytes } from "../download";
import { useContentZoom, type ContentZoom } from "../hooks/useContentZoom";
import { formatBytes } from "../syncApi";
import type { PdfLoading, PdfPage } from "./pdf/pdfEngine";

// For a file on this Mac or a paired one, which comes a chunk at a time; a
// host too old for that still caps it at 8 MB and says to update it.
const MAX_BYTES = 64 * 1024 * 1024;

export interface PdfPreview {
  pages: PdfPage[] | null;
  error: string | null;
  meta: string | null;
  // 100% fits each page to the width it is given.
  zoom: ContentZoom;
}

// PDF.js names its failures; the two a person can act on get said plainly.
function pdfErrorMessage(err: unknown): string {
  const name = (err as { name?: unknown } | null)?.name;
  if (name === "InvalidPDFException") return "This file isn't a readable PDF.";
  if (name === "PasswordException") return "This PDF is password-protected.";
  return err instanceof Error ? err.message : String(err);
}

function describe(bytes: number, pages: number): string | null {
  if (bytes <= 0) return null;
  if (pages <= 0) return formatBytes(bytes);
  return `${formatBytes(bytes)} · ${pages} ${pages === 1 ? "page" : "pages"}`;
}

// The bytes are read the same way from this Mac or a paired one, and drawn
// here by PDF.js, so the page looks the same whatever macOS the Mac runs.
export function usePdfPreview(path: string, active: boolean): PdfPreview {
  const [pages, setPages] = useState<PdfPage[] | null>(null);
  const [bytes, setBytes] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const zoom = useContentZoom(active);

  const { zoomReset } = zoom;
  useEffect(() => {
    setPages(null);
    setBytes(0);
    setError(null);
    zoomReset();
    if (!active || !path) return;
    let cancelled = false;
    let loading: PdfLoading | null = null;
    (async () => {
      const [input, { openPdf }] = await Promise.all([
        NotesReadFileAsInput(path, MAX_BYTES) as Promise<{ data: string }>,
        import("./pdf/pdfEngine"),
      ]);
      if (cancelled) return;
      const data = base64ToBytes(input.data);
      setBytes(data.byteLength);
      loading = openPdf(data);
      const loaded = await loading.pages;
      if (!cancelled) setPages(loaded);
    })().catch((err: unknown) => {
      if (!cancelled) setError(pdfErrorMessage(err));
    });
    return () => {
      cancelled = true;
      void loading?.destroy();
    };
  }, [path, active, zoomReset]);

  return { pages, error, meta: describe(bytes, pages?.length ?? 0), zoom };
}
