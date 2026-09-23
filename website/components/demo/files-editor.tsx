"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import { Folder } from "lucide-react";
import { highlight, langOf } from "./code-highlight";
import { numberDiff } from "./diff-lines";
import { basename } from "./files-model";
import type { ChangedFile } from "./projects";
import type { ReaderZoom } from "./use-file-view";

const FilesMarkdownPreview = dynamic(
  () => import("./files-markdown-preview").then((m) => m.FilesMarkdownPreview),
  { ssr: false, loading: () => <div className="h-full" /> },
);

const GUTTER =
  "sticky left-0 shrink-0 select-none bg-[#1a1a1a] px-2 text-right tabular-nums text-[#8e8e8e]";

export function FilesEditor({
  path,
  content,
  binary,
  diff,
  markdown,
  fontSize,
}: {
  path: string | null;
  content: string;
  binary: boolean;
  // Set to show the file against HEAD instead of on its own.
  diff: ChangedFile | null;
  // Set to render the file (Markdown) instead of showing its source.
  markdown: { zoom: ReaderZoom; onOpenFile: (path: string) => void } | null;
  fontSize: number;
}) {
  const lines = useMemo(
    () =>
      path && !diff && !binary && !markdown
        ? highlight(content.replace(/\n$/, ""), langOf(basename(path)))
        : [],
    [path, content, diff, binary, markdown],
  );
  const rows = useMemo(() => (diff ? numberDiff(diff.diff) : []), [diff]);

  if (!path) {
    return <Placeholder title="Select a file" body="Pick one from the tree, or filter by name." />;
  }

  if (binary && !diff) {
    return (
      <Placeholder
        title={basename(path)}
        body="Binary file — nothing to show here."
      />
    );
  }

  const style = { fontSize: `${fontSize}px`, lineHeight: 1.6 };

  if (diff) {
    return (
      <div className="h-full overflow-auto">
        <div className="min-w-max py-1 font-mono" style={style}>
          {rows.map((row, i) => {
            if (row.line.t === "hunk") {
              return (
                <div key={i} className="whitespace-pre bg-[#242424] px-3 text-[#8e8e8e]">
                  {row.line.text}
                </div>
              );
            }
            const added = row.line.t === "add";
            const removed = row.line.t === "del";
            return (
              <div
                key={i}
                className={`flex ${
                  added ? "bg-[#4ade80]/[0.08]" : removed ? "bg-[#f87171]/[0.08]" : ""
                }`}
              >
                <span className="sticky left-0 flex shrink-0 select-none bg-[#1a1a1a]">
                  <span
                    className={`flex ${
                      added ? "bg-[#4ade80]/20" : removed ? "bg-[#f87171]/20" : ""
                    }`}
                  >
                    <span className="w-9 px-1.5 text-right tabular-nums text-[#8e8e8e]">
                      {row.oldNo ?? ""}
                    </span>
                    <span className="w-9 px-1.5 text-right tabular-nums text-[#8e8e8e]">
                      {row.newNo ?? ""}
                    </span>
                  </span>
                </span>
                <span
                  className={`w-4 shrink-0 select-none text-center ${
                    added ? "text-[#4ade80]" : removed ? "text-[#f87171]" : ""
                  }`}
                >
                  {added ? "+" : removed ? "-" : ""}
                </span>
                <span
                  className={`whitespace-pre pr-4 ${
                    added || removed ? "text-[#cccccc]" : "text-[#8e8e8e]"
                  }`}
                >
                  {row.line.text.slice(1) || " "}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (markdown) {
    return (
      <FilesMarkdownPreview
        text={content}
        path={path}
        zoom={markdown.zoom}
        onOpenFile={markdown.onOpenFile}
      />
    );
  }

  // The number sits inside the gutter's own padding, so the width has to
  // carry both.
  const width = `calc(${String(lines.length).length}ch + 1.5rem)`;
  return (
    <div className="h-full overflow-auto">
      <div className="min-w-max py-1 font-mono" style={style}>
        {lines.map((tokens, i) => (
          <div key={i} className="flex">
            <span className={GUTTER} style={{ width }}>
              {i + 1}
            </span>
            <span className="whitespace-pre pr-6 text-[#cccccc]">
              {tokens.length === 0
                ? " "
                : tokens.map((token, j) => (
                    <span key={j} className={token.cls}>
                      {token.text}
                    </span>
                  ))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Placeholder({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#242424] text-[#919191]">
        <Folder className="h-[18px] w-[18px]" strokeWidth={2} />
      </div>
      <div className="space-y-0.5">
        <p className="text-xs font-medium text-[#b3b3b3]">{title}</p>
        <p className="break-all text-[11px] text-[#919191]">{body}</p>
      </div>
    </div>
  );
}
