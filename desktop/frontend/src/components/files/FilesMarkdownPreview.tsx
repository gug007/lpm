import { useMemo, type CSSProperties, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { BrowserOpenURL } from "../../../bridge/runtime";
import type { ContentZoom } from "../../hooks/useContentZoom";
import { joinAbs } from "../../path";
import { markdownComponents } from "../MessageMarkdown";
import { FilesMarkdownImage } from "./FilesMarkdownImage";
import { markdownTarget } from "./markdownLinks";

export interface MarkdownPreviewOptions {
  zoom: ContentZoom;
  projectRoot: string;
  onOpenFile: (path: string) => void;
}

interface FilesMarkdownPreviewProps extends MarkdownPreviewOptions {
  text: string;
  path: string;
}

// GitHub allows inline HTML (centred blocks, sized images, <br>, <details>);
// the raw pass parses it and the sanitizer keeps GitHub's own allow-list, so a
// README renders here the way it does there without running its scripts.
const REHYPE_PLUGINS = [rehypeRaw, rehypeSanitize];
const IMAGE_CLASS = "my-2 inline-block max-w-full rounded-md";
const HEADING_RULE =
  "mb-3 border-b border-[var(--border)] pb-1.5 font-semibold first:mt-0";

// A Markdown file rendered instead of edited, GitHub-style. Links to other
// project files open them here; images beside the file are read from disk.
export function FilesMarkdownPreview({
  text,
  path,
  zoom,
  projectRoot,
  onOpenFile,
}: FilesMarkdownPreviewProps) {
  const components = useMemo<Components>(
    () => ({
      ...markdownComponents,
      a({ children, href, title }) {
        const target = href ? markdownTarget(path, href) : null;
        return (
          <a
            href={href}
            title={title}
            onClick={(e) => {
              e.preventDefault();
              if (target?.kind === "external") BrowserOpenURL(target.url);
              else if (target?.kind === "file") onOpenFile(target.path);
            }}
            className="text-[var(--accent-blue,#3b82f6)] underline hover:opacity-80"
          >
            {children}
          </a>
        );
      },
      img({ src, alt, width, height }) {
        const target = src ? markdownTarget(path, src) : null;
        if (target?.kind === "file") {
          return (
            <FilesMarkdownImage
              absPath={joinAbs(projectRoot, target.path)}
              alt={alt ?? ""}
              width={width}
              height={height}
            />
          );
        }
        return <img src={src} alt={alt} width={width} height={height} className={IMAGE_CLASS} />;
      },
      // Chat paragraphs keep their line breaks; a document joins them. The
      // legacy align attribute is how READMEs centre a block.
      p({ children, align }: { children?: ReactNode; align?: string }) {
        return (
          <p
            className="my-2 break-words leading-relaxed"
            style={align ? { textAlign: align as CSSProperties["textAlign"] } : undefined}
          >
            {children}
          </p>
        );
      },
      h1({ children }) {
        return <h1 className={`${HEADING_RULE} mt-6 text-xl`}>{children}</h1>;
      },
      h2({ children }) {
        return <h2 className={`${HEADING_RULE} mt-5 text-lg`}>{children}</h2>;
      },
      h3({ children }) {
        return <h3 className="mb-2 mt-4 text-base font-semibold first:mt-0">{children}</h3>;
      },
    }),
    [path, projectRoot, onOpenFile],
  );

  return (
    <div
      ref={zoom.surfaceRef}
      data-files-preview
      tabIndex={-1}
      className="h-full overflow-y-auto outline-none"
    >
      <div
        className="mx-auto max-w-3xl select-text px-8 py-6 text-sm text-[var(--text-primary)]"
        style={{ zoom: zoom.zoom }}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={REHYPE_PLUGINS}
          components={components}
        >
          {text}
        </ReactMarkdown>
      </div>
    </div>
  );
}
