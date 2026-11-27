import { useEffect, useState, type ReactNode } from "react";
import { plural } from "../projectArchive";
import { relativeAgo } from "../relativeTime";
import { useAppStore } from "../store/app";
import { STATUS_DISPLAY } from "./ChangedFilesTree";
import { LineCounts } from "./LineCounts";
import { chipBranchLine } from "./composerChipBranch";
import {
  blockBody,
  CHIP_KINDS,
  commitInfo,
  diffFiles,
  linesDetail,
  threadInfo,
  type ChipSpec,
  type DiffFile,
} from "./composerChips";

interface ComposerChipDetailsProps {
  text: string;
  spec: ChipSpec;
  // The card shows everything; the hover preview a glance. A paste's text and
  // a diff's files are the card's own to draw (an editable field, file picks).
  full: boolean;
}

const PRE =
  "overflow-hidden whitespace-pre rounded-md bg-[var(--bg-primary)] px-2 py-1.5 font-mono text-[11px] leading-4 text-[var(--text-secondary)]";
const PRE_FULL = `${PRE} max-h-[220px] overflow-auto`;

const first = (body: string, n: number) => body.split("\n").slice(0, n).join("\n");
const last = (body: string, n: number) => body.split("\n").slice(-n).join("\n");

function rows(list: Array<[string, string]>, good?: string): ReactNode {
  return (
    <div className="flex flex-col gap-1 text-[12px]">
      {list
        .filter(([, v]) => v)
        .map(([k, v]) => (
          <div key={k} className="flex gap-2.5">
            <span className="w-14 shrink-0 text-[var(--text-muted)]">{k}</span>
            <span className={`min-w-0 break-all ${k === good ? "text-[var(--accent-green)]" : "text-[var(--text-secondary)]"}`}>
              {v}
            </span>
          </div>
        ))}
    </div>
  );
}

function fileList(files: DiffFile[], max: number): ReactNode {
  return (
    <div className="flex flex-col gap-0.5 font-mono text-[11.5px] leading-[18px]">
      {files.slice(0, max).map((f) => (
        <div key={f.path} className="flex items-center gap-2">
          <span className={`w-3 shrink-0 ${STATUS_DISPLAY[f.status].color}`}>{STATUS_DISPLAY[f.status].label}</span>
          <span className="min-w-0 flex-1 truncate text-[var(--text-secondary)]">{f.path}</span>
          <LineCounts added={f.added} removed={f.removed} />
        </div>
      ))}
      {files.length > max && (
        <div className="text-[11px] text-[var(--text-muted)]">and {plural(files.length - max, "more file")}</div>
      )}
    </div>
  );
}

export function ComposerChipDetails({ text, spec, full }: ComposerChipDetailsProps) {
  const body = spec.kind === "paste" || spec.kind === "quote" ? text : blockBody(text);
  const projectName = spec.source?.project;
  const project = useAppStore((s) => (projectName ? s.projects.find((p) => p.name === projectName) : undefined));
  const root = project && !project.isRemote ? project.root : null;
  const [branch, setBranch] = useState<string | null>(null);

  useEffect(() => {
    if (!root) return;
    let live = true;
    void chipBranchLine(root).then((line) => {
      if (live && line) setBranch(line);
    });
    return () => {
      live = false;
    };
  }, [root]);

  let title = spec.label;
  let meta: ReactNode = null;
  let content: ReactNode = null;

  switch (spec.kind) {
    case "project":
    case "duplicate": {
      meta = spec.title;
      const services = project?.running ? project.services.map((s) => s.name).join(", ") : "";
      content = rows(
        [
          ["Folder", text.slice(1)],
          ["Branch", root ? (branch ?? "…") : ""],
          ["Status", project ? (project.running ? `Running${services ? ` · ${services}` : ""}` : "Stopped") : ""],
        ],
        project?.running ? "Status" : undefined,
      );
      break;
    }
    case "computer":
      title = `${spec.label} ${spec.detail ?? ""}`.trim();
      meta = "Another computer";
      content = rows([
        ["Folder", spec.title?.slice(spec.title.indexOf(":") + 1) ?? ""],
        ["Reach", "lpm exec --on and lpm cp"],
      ]);
      break;
    case "terminal":
    case "service": {
      title = spec.kind === "service" ? `${spec.label} logs` : spec.label === "terminal" ? "Terminal output" : `${spec.label} output`;
      const at = spec.source?.capturedAt;
      meta = [linesDetail(body), at ? `captured ${relativeAgo(at)}` : ""].filter(Boolean).join(" · ");
      content = <pre className={full ? PRE_FULL : PRE}>{full ? body : last(body, 5)}</pre>;
      break;
    }
    case "paste":
    case "quote":
      meta = linesDetail(body);
      if (!full) content = <pre className={PRE}>{first(body, 5)}</pre>;
      break;
    case "diff": {
      const files = diffFiles(body);
      meta = (
        <LineCounts
          added={files.reduce((sum, f) => sum + f.added, 0)}
          removed={files.reduce((sum, f) => sum + f.removed, 0)}
        />
      );
      if (!full) content = fileList(files, 6);
      break;
    }
    case "commit": {
      const info = commitInfo(body);
      const files = diffFiles(body);
      title = info.subject || spec.label;
      meta = [spec.label, info.date].filter(Boolean).join(" · ");
      content = full ? (
        <>
          <pre className={`${PRE} whitespace-pre-wrap`}>{info.message}</pre>
          {files.length > 0 && fileList(files, files.length)}
        </>
      ) : (
        rows([
          ["Author", info.author],
          ["Changes", files.length ? plural(files.length, "file") : "message only"],
        ])
      );
      break;
    }
    case "pr":
    case "issue": {
      const t = threadInfo(body);
      title = `#${t.number} ${t.title}`;
      meta = t.comments ? plural(t.comments, "comment") : null;
      if (t.excerpt) {
        content = <pre className={`${full ? PRE_FULL : PRE} whitespace-pre-wrap`}>{full ? t.excerpt : first(t.excerpt, 3)}</pre>;
      }
      break;
    }
    case "file":
    case "dir":
      title = spec.source?.path ?? spec.label;
      meta = spec.kind === "file" ? "File" : "Folder";
      break;
    case "branch":
      meta = "Branch";
      break;
  }

  return (
    <>
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="min-w-0 truncate text-[13px] font-semibold text-[var(--text-primary)]">{title}</span>
        {meta ? <span className="ml-auto shrink-0 text-[11px] text-[var(--text-muted)]">{meta}</span> : null}
      </div>
      {content}
      {full && CHIP_KINDS[spec.kind].short && (
        <>
          <div className="text-[11px] font-medium text-[var(--text-muted)]">Agent gets</div>
          <pre className={`${PRE} whitespace-pre-wrap break-all`}>{text}</pre>
        </>
      )}
    </>
  );
}
