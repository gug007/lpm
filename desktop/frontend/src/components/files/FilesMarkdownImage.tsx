import { useEffect, useState } from "react";
import { NotesReadFileAsInput } from "../../../bridge/commands";
import { basename } from "../../path";
import { IMAGE_PREVIEW_MAX_BYTES } from "../imagePreview";

interface FilesMarkdownImageProps {
  absPath: string;
  alt: string;
  width?: number | string;
  height?: number | string;
}

// An image a Markdown file names by path, read from disk like an opened image;
// one that can't be read or decoded shows as its alt text.
export function FilesMarkdownImage({ absPath, alt, width, height }: FilesMarkdownImageProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    setFailed(false);
    NotesReadFileAsInput(absPath, IMAGE_PREVIEW_MAX_BYTES)
      .then((input: { mimeType?: string; data: string }) => {
        if (!cancelled) setSrc(`data:${input.mimeType || "image/png"};base64,${input.data}`);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [absPath]);

  if (failed) {
    return <span className="text-[var(--text-muted)]">{alt || basename(absPath)}</span>;
  }
  if (!src) return null;
  return (
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      onError={() => setFailed(true)}
      className="my-2 inline-block max-w-full rounded-md"
    />
  );
}
