import { useMemo } from "react";
import { setupMonaco } from "../../monaco-setup";
import { FolderIcon, FileIcon } from "../icons";
import { ImageFileView } from "../ImageFileView";
import { MonacoEditor } from "../MonacoEditor";
import { VideoFileView } from "../VideoFileView";
import { mediaKind } from "../fileMedia";
import { useImagePreview } from "../imagePreview";
import { BinaryFilePlaceholder } from "../review/BinaryFilePlaceholder";
import { useVideoPreview } from "../videoPreview";
import { languageForPath } from "./monacoLanguage";
import type { OpenFile } from "./useFileBuffer";

interface FilesEditorProps {
  // Scopes the Monaco model to this tab: two Files tabs open on one file must
  // not share a model, or closing either disposes the other's.
  instanceId: string;
  file: OpenFile | null;
  value: string;
  absPath: string;
  active: boolean;
  readOnly: boolean;
  onChange: (text: string) => void;
  onSave: () => void;
}

// SVG is source as much as it is an image; here, where files are edited, it
// opens as text.
const SOURCE_IMAGE_RE = /\.svg$/i;

function mediaOf(path: string | null) {
  if (!path) return null;
  const kind = mediaKind(path);
  return kind === "image" && SOURCE_IMAGE_RE.test(path) ? null : kind;
}

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function FilesEditor({
  instanceId,
  file,
  value,
  absPath,
  active,
  readOnly,
  onChange,
  onSave,
}: FilesEditorProps) {
  const path = file?.path ?? null;
  const media = mediaOf(path);
  const preview = useImagePreview(absPath, active && media === "image");
  const video = useVideoPreview(absPath, active && media === "video");
  const language = useMemo(
    () => (path && !media ? languageForPath(path, setupMonaco().languages.getLanguages()) : "plaintext"),
    [path, media],
  );

  if (!file) {
    return (
      <Placeholder
        icon={<FolderIcon />}
        title="Select a file"
        body="Pick one from the tree, or filter by name."
      />
    );
  }
  if (file.loading) {
    return (
      <div className="flex h-full items-center justify-center text-[11px] text-[var(--text-muted)]">
        Loading…
      </div>
    );
  }
  if (file.error) {
    return <Placeholder tone="bad" icon={<FileIcon size={18} />} title="Couldn't open file" body={file.error} />;
  }
  if (media === "video") return <VideoFileView video={video} />;
  if (media === "image") return <ImageFileView preview={preview} />;
  if (file.binary) return <BinaryFilePlaceholder path={file.path} />;
  if (file.tooLarge) {
    return (
      <BinaryFilePlaceholder
        path={file.path}
        message={`Too large to open here (${formatSize(file.size)}) — use Open to view it elsewhere`}
      />
    );
  }
  return (
    <MonacoEditor
      key={file.path}
      value={value}
      onChange={onChange}
      language={language}
      modelUri={`lpm-files://${instanceId}/${absPath}`}
      onSave={onSave}
      readOnly={readOnly}
    />
  );
}

function Placeholder({
  icon,
  title,
  body,
  tone = "muted",
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  tone?: "muted" | "bad";
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--bg-secondary)] ${
          tone === "bad" ? "text-[var(--accent-red)]" : "text-[var(--text-muted)]"
        }`}
      >
        {icon}
      </div>
      <div className="space-y-0.5">
        <p className="text-xs font-medium text-[var(--text-secondary)]">{title}</p>
        <p className="max-w-sm break-words text-[11px] text-[var(--text-muted)]">{body}</p>
      </div>
    </div>
  );
}
