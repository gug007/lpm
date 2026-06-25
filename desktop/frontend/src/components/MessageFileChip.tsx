import { basename } from "../path";
import { FILE_CHIP_LABEL_CLASS, IMAGE_CHIP_CLASS, IMAGE_CHIP_THUMB_CLASS } from "./composerEditor";
import { FileIcon } from "./icons";

interface MessageFileChipProps {
  path: string;
}

// Read-only mirror of the composer's file chip (a non-image attachment): a file
// glyph + the basename, sharing the image chip's resting shape. Unlike
// MessageImageChip it reads no file bytes and shows no preview — there's nothing
// to render and a large file shouldn't be slurped just to draw a history row.
export function MessageFileChip({ path }: MessageFileChipProps) {
  return (
    <span className={`mx-0.5 ${IMAGE_CHIP_CLASS}`}>
      <span className={`${IMAGE_CHIP_THUMB_CLASS} flex items-center justify-center text-[var(--text-muted)]`}>
        <FileIcon size={12} />
      </span>
      <span className={FILE_CHIP_LABEL_CLASS} title={path}>
        {basename(path)}
      </span>
    </span>
  );
}
