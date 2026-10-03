// PDF.js, loaded only when a PDF is first shown. The legacy build, because the
// modern one needs a newer WebKit than older macOS versions ship.
import { getDocument, GlobalWorkerOptions, TextLayer } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PDFPageProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import "./pdfTextLayer.css";

GlobalWorkerOptions.workerSrc = workerUrl;

const ASSETS = new URL("pdfjs/", document.baseURI).href;

export interface PdfDrawing {
  promise: Promise<unknown>;
  cancel: () => void;
}

export interface PdfPage {
  // In PDF points, with the page's own rotation applied.
  width: number;
  height: number;
  // `density` is device pixels per CSS pixel.
  draw: (canvas: HTMLCanvasElement, scale: number, density: number) => PdfDrawing;
  // The page's text, laid invisibly over the drawing so it can be selected.
  drawText: (layer: HTMLDivElement, scale: number) => PdfDrawing;
  // Drops what drawing decoded (images, fonts' glyphs) until it is drawn again.
  release: () => void;
}

export interface PdfLoading {
  pages: Promise<PdfPage[]>;
  destroy: () => Promise<void>;
}

function pageOf(proxy: PDFPageProxy): PdfPage {
  const { width, height } = proxy.getViewport({ scale: 1 });
  return {
    width,
    height,
    draw(canvas, scale, density) {
      const viewport = proxy.getViewport({ scale });
      canvas.width = Math.floor(viewport.width * density);
      canvas.height = Math.floor(viewport.height * density);
      const task = proxy.render({
        canvas,
        viewport,
        transform: density === 1 ? undefined : [density, 0, 0, density, 0, 0],
      });
      return { promise: task.promise, cancel: () => task.cancel() };
    },
    drawText(layer, scale) {
      const text = new TextLayer({
        textContentSource: proxy.streamTextContent(),
        container: layer,
        viewport: proxy.getViewport({ scale }),
      });
      return { promise: text.render(), cancel: () => text.cancel() };
    },
    release: () => {
      proxy.cleanup();
    },
  };
}

// `data` is handed to the worker and unusable here afterwards. The worker must
// be told it may fetch: under the app's own URL scheme it otherwise assumes it
// can't, and draws CMYK colours without their colour profile.
export function openPdf(data: Uint8Array): PdfLoading {
  const task = getDocument({
    data,
    useWorkerFetch: true,
    standardFontDataUrl: `${ASSETS}standard_fonts/`,
    cMapUrl: `${ASSETS}cmaps/`,
    wasmUrl: `${ASSETS}wasm/`,
    iccUrl: `${ASSETS}iccs/`,
  });
  const pages = task.promise.then((doc) =>
    Promise.all(Array.from({ length: doc.numPages }, (_, i) => doc.getPage(i + 1).then(pageOf))),
  );
  return { pages, destroy: () => task.destroy() };
}
