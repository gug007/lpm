import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { main } from "../../../bridge/models";
import { DEFAULT_MONACO_FONT_SIZE } from "../../monaco-theme";
import { STATUS_DISPLAY, DEFAULT_STATUS } from "../ChangedFilesTree";
import { MonacoDiffFile } from "./MonacoDiffFile";
import { type ReviewMode } from "./reviewSource";

type ChangedFile = main.ChangedFile;

// Mount editors a viewport ahead so they size off-screen (the browser's scroll
// anchoring keeps the visible content stable). Editors stay mounted once shown —
// re-creating them on scroll-away caused flicker; smoothness wins over the memory
// bound for typical changesets.
const LAZY_ROOT_MARGIN_PX = 800;

export interface MonacoDiffStackHandle {
  scrollToPath: (path: string) => void;
}

interface MonacoDiffStackProps {
  projectRoot: string;
  files: ChangedFile[];
  mode: ReviewMode;
  baseBranch: string;
  active: boolean;
}

export const MonacoDiffStack = forwardRef<MonacoDiffStackHandle, MonacoDiffStackProps>(
  function MonacoDiffStack({ projectRoot, files, mode, baseBranch, active }, ref) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const itemRefs = useRef<Map<string, HTMLElement>>(new Map());
    const observerRef = useRef<IntersectionObserver | null>(null);
    const [mounted, setMounted] = useState<Set<string>>(new Set());

    // Drop bookkeeping for files that left the list; keep everything else mounted
    // so unsaved edits survive an unrelated list change.
    useEffect(() => {
      const valid = new Set(files.map((f) => f.path));
      setMounted((prev) => {
        const next = new Set([...prev].filter((p) => valid.has(p)));
        return next.size === prev.size ? prev : next;
      });
    }, [files]);

    useEffect(() => {
      const root = scrollRef.current;
      if (!root) return;
      const observer = new IntersectionObserver(
        (entries) => {
          const seen: string[] = [];
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const path = (entry.target as HTMLElement).dataset.path;
            if (path) {
              seen.push(path);
              observer.unobserve(entry.target); // mount once, then stop watching
            }
          }
          if (seen.length === 0) return;
          setMounted((prev) => {
            const next = new Set(prev);
            for (const p of seen) next.add(p);
            return next;
          });
        },
        { root, rootMargin: `${LAZY_ROOT_MARGIN_PX}px 0px` },
      );
      observerRef.current = observer;
      itemRefs.current.forEach((el) => observer.observe(el));
      return () => {
        observer.disconnect();
        observerRef.current = null;
      };
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        scrollToPath: (path: string) => {
          setMounted((prev) => {
            if (prev.has(path)) return prev;
            const next = new Set(prev);
            next.add(path);
            return next;
          });
          requestAnimationFrame(() => {
            itemRefs.current
              .get(path)
              ?.scrollIntoView({ behavior: "smooth", block: "start" });
          });
        },
      }),
      [],
    );

    return (
      <div ref={scrollRef} className="h-full w-full overflow-y-auto">
        {files.length === 0 ? (
          <div className="py-10 text-center text-[11px] text-[var(--text-muted)]">
            Nothing to review
          </div>
        ) : (
          files.map((file) => {
            const isMounted = mounted.has(file.path);
            return (
              <div
                key={`${mode}-${file.path}`}
                data-path={file.path}
                ref={(el) => {
                  const prev = itemRefs.current.get(file.path);
                  if (prev && prev !== el) observerRef.current?.unobserve(prev);
                  if (el) {
                    itemRefs.current.set(file.path, el);
                    if (!isMounted) observerRef.current?.observe(el);
                  } else {
                    itemRefs.current.delete(file.path);
                  }
                }}
              >
                {isMounted ? (
                  <MonacoDiffFile
                    projectRoot={projectRoot}
                    file={file}
                    mode={mode}
                    baseBranch={baseBranch}
                    fontSize={DEFAULT_MONACO_FONT_SIZE}
                    active={active}
                  />
                ) : (
                  <FilePlaceholder file={file} />
                )}
              </div>
            );
          })
        )}
      </div>
    );
  },
);

function FilePlaceholder({ file }: { file: ChangedFile }) {
  const { label, color } = STATUS_DISPLAY[file.status] ?? DEFAULT_STATUS;
  return (
    <div className="border-b border-[var(--border)]">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-2 text-[11px] font-medium text-[var(--text-primary)]">
        <span className={`w-3 shrink-0 text-center font-bold ${color}`} title={file.status}>
          {label}
        </span>
        <span className="truncate">{file.path}</span>
      </div>
      <div aria-hidden style={{ height: 120 }} />
    </div>
  );
}
