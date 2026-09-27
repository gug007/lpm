import type { KeyboardEvent } from "react";
import { basename, relTo } from "../path";
import { stripMarker } from "../peer/markers";
import { openFileViewer } from "../store/fileViewer";
import { XIcon } from "./icons";
import { FileTypeIcon } from "./files/FileTypeIcon";

interface FileViewerChoicesProps {
  choices: string[];
  line: number;
  col: number;
  projectRoot: string;
  onClose: () => void;
}

function moveFocus(e: KeyboardEvent<HTMLUListElement>) {
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  e.preventDefault();
  const items = [...e.currentTarget.querySelectorAll("button")];
  const at = items.indexOf(document.activeElement as HTMLButtonElement);
  const step = e.key === "ArrowDown" ? 1 : -1;
  items[(at + step + items.length) % items.length]?.focus();
}

// A terminal reference that fits several project files, such as a bare
// `README.md`: pick one and the viewer opens it at the same line.
export function FileViewerChoices({ choices, line, col, projectRoot, onClose }: FileViewerChoicesProps) {
  return (
    <div className="flex max-h-[70vh] w-[min(640px,calc(100vw-32px))] flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-[var(--border)] px-6 py-3">
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold text-[var(--text-primary)]">
            Which {basename(choices[0])}?
          </div>
          <div className="text-[12px] text-[var(--text-muted)]">
            {choices.length} files in this project match
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-xl p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <XIcon />
        </button>
      </header>
      <ul className="min-h-0 overflow-y-auto p-2" onKeyDown={moveFocus}>
        {choices.map((abs, i) => (
          <li key={abs}>
            <button
              type="button"
              autoFocus={i === 0}
              onClick={() => openFileViewer({ absPath: abs, line, col, projectRoot })}
              className="flex w-full items-center rounded-lg py-1.5 pr-3 text-left text-[13px] text-[var(--text-primary)] outline-none hover:bg-[var(--bg-hover)] focus-visible:bg-[var(--bg-hover)]"
            >
              <FileTypeIcon name={basename(abs)} />
              <span className="truncate">{stripMarker(relTo(abs, projectRoot))}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
