import { PdfPages } from "./pdf/PdfPages";
import { PreviewStatus } from "./PreviewStatus";
import type { PdfPreview } from "./pdfPreview";

interface PdfFileViewProps {
  pdf: PdfPreview;
}

export function PdfFileView({ pdf }: PdfFileViewProps) {
  if (pdf.error || !pdf.pages) {
    return (
      <div className="flex h-full w-full p-6">
        <PreviewStatus error={pdf.error} />
      </div>
    );
  }
  return <PdfPages pages={pdf.pages} zoom={pdf.zoom.zoom} />;
}
