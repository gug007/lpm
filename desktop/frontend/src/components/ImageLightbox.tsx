import { Modal } from "./ui/Modal";
import { useImageDataUrl } from "./imageDataUrl";
import { XIcon } from "./icons";

interface ImageLightboxProps {
  path: string;
  onClose: () => void;
}

// Full-window view of a composer image, opened by clicking its chip. Backdrop
// click and Escape close it (handled by Modal); the chip's small hover popover
// stays for at-a-glance peeking.
export function ImageLightbox({ path, onClose }: ImageLightboxProps) {
  const { url, failed } = useImageDataUrl(path);

  return (
    <Modal
      open
      onClose={onClose}
      zIndexClassName="z-[9999]"
      backdropClassName="bg-black/80"
      containerClassName="p-6"
      contentClassName="flex max-h-full max-w-full items-center justify-center"
    >
      {url ? (
        <img src={url} alt="" className="max-h-[90vh] max-w-[90vw] rounded object-contain" />
      ) : (
        <div className="flex h-32 w-48 items-center justify-center rounded-lg bg-[var(--bg-secondary)] px-3 text-center text-sm text-[var(--text-muted)]">
          {failed ? "Preview unavailable" : "Loading…"}
        </div>
      )}
      <button
        type="button"
        onClick={onClose}
        title="Close"
        aria-label="Close"
        className="absolute right-2 top-2 rounded-md bg-black/60 p-1.5 text-white transition-colors hover:bg-black/80"
      >
        <XIcon />
      </button>
    </Modal>
  );
}
