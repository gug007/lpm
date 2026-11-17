import { useEffect, useRef, useState } from "react";
import { toast } from "../../notifications/toast";
import { NotesReadAttachment, NotesSaveAttachment, NotesSaveAttachmentData } from "../../../bridge/commands";
import type { notes } from "../../../bridge/models";
import { isPeerName } from "../../peer/markers";
import { base64ToBytes, bytesToBlobUrl } from "../../download";
import { logDiagnostic } from "../../diagnostics";
import { DownloadIcon, XIcon } from "../icons";
import { Modal } from "../ui/Modal";
import { formatSize } from "./notesFormat";

const LIGHTBOX_BTN =
  "rounded-md bg-black/60 p-1.5 text-white transition-colors hover:bg-black/80";

interface NoteAttachmentProps {
  projectName: string;
  attachment: notes.Attachment;
}

export function NoteAttachment({ projectName, attachment }: NoteAttachmentProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const isImage = attachment.mimeType?.startsWith("image/");

  // Ref-tracked so StrictMode's double-invocation doesn't revoke the live URL
  // before <img> finishes loading.
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isImage) return;
    let cancelled = false;
    (async () => {
      try {
        const b64 = await NotesReadAttachment(projectName, attachment.hash);
        if (cancelled) return;
        const u = bytesToBlobUrl(
          base64ToBytes(b64),
          attachment.mimeType || "application/octet-stream",
        );
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = u;
        setUrl(u);
      } catch (err) {
        logDiagnostic(
          "warn",
          "notes.attachment_preview_failed",
          "Attachment preview could not be loaded",
          { hash: attachment.hash, error: err },
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectName, attachment.hash, attachment.mimeType, isImage]);

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  const download = async () => {
    try {
      // A paired machine's attachment is saved here, where the folder is picked.
      const path = isPeerName(projectName)
        ? await NotesSaveAttachmentData(
            attachment.name,
            await NotesReadAttachment(projectName, attachment.hash),
          )
        : await NotesSaveAttachment(projectName, attachment.hash, attachment.name);
      if (path) toast.success(`Saved to ${path}`);
    } catch (err) {
      toast.error(`Save: ${err}`);
    }
  };

  if (isImage && url) {
    return (
      <>
        <button
          onClick={() => setLightboxOpen(true)}
          className="overflow-hidden rounded-lg border border-[var(--border)] transition-opacity hover:opacity-90"
          title={`${attachment.name} · ${formatSize(attachment.size)} — click to view`}
        >
          <img src={url} alt={attachment.name} className="max-h-56 max-w-xs object-contain" />
        </button>
        <Modal
          open={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
          backdropClassName="bg-black/80"
          containerClassName="p-6"
          contentClassName="flex max-h-full max-w-full items-center justify-center"
        >
          <img src={url} alt={attachment.name} className="max-h-[90vh] max-w-[90vw] object-contain" />
          <div className="absolute right-2 top-2 flex gap-1">
            <button onClick={download} className={LIGHTBOX_BTN} title="Download">
              <DownloadIcon />
            </button>
            <button onClick={() => setLightboxOpen(false)} className={LIGHTBOX_BTN} title="Close">
              <XIcon />
            </button>
          </div>
        </Modal>
      </>
    );
  }

  return (
    <button
      onClick={download}
      className="flex items-center gap-2 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-[12px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
      title={`Download ${attachment.name}`}
    >
      <DownloadIcon />
      <span className="max-w-[220px] truncate">{attachment.name}</span>
      <span className="text-[11px] text-[var(--text-muted)]">{formatSize(attachment.size)}</span>
    </button>
  );
}
