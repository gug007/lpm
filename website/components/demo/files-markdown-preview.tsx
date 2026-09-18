"use client";

import { useMemo, type CSSProperties, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { FilesMarkdownCode } from "./files-markdown-code";
import { basename } from "./files-model";
import { markdownTarget } from "./markdown-links";
import type { ReaderZoom } from "./use-file-view";

// GitHub allows inline HTML (centred blocks, sized images, <br>, <details>);
// the raw pass parses it and the sanitizer keeps GitHub's own allow-list.
const REHYPE_PLUGINS = [rehypeRaw, rehypeSanitize];
const REMARK_PLUGINS = [remarkGfm];
const HEADING_RULE =
  "mb-3 border-b border-[#2e2e2e] pb-1.5 font-semibold text-[#e5e5e5] first:mt-0";
const CELL = "border border-[#2e2e2e] px-2 py-1";

// A Markdown file rendered instead of shown as source, the way the app's Files
// tab does it. Links to other project files open them here; the demo has no
// image bytes, so a local image stands in as its alt text.
export function FilesMarkdownPreview({
  text,
  path,
  zoom,
  onOpenFile,
}: {
  text: string;
  path: string;
  zoom: ReaderZoom;
  onOpenFile: (path: string) => void;
}) {
  const components = useMemo<Components>(
    () => ({
      a({ children, href, title }) {
        const target = href ? markdownTarget(path, href) : null;
        const external = target?.kind === "external";
        return (
          <a
            href={href}
            title={title}
            target={external ? "_blank" : undefined}
            rel={external ? "noreferrer" : undefined}
            onClick={(e) => {
              if (external) return;
              e.preventDefault();
              if (target?.kind === "file") onOpenFile(target.path);
            }}
            className="text-[#60a5fa] underline hover:opacity-80"
          >
            {children}
          </a>
        );
      },
      img({ src, alt, width, height }) {
        const target = typeof src === "string" ? markdownTarget(path, src) : null;
        if (target?.kind === "file") {
          return <span className="text-[#919191]">{alt || basename(target.path)}</span>;
        }
        // eslint-disable-next-line @next/next/no-img-element
        return <img src={src} alt={alt} width={width} height={height} className="my-2 inline-block max-w-full rounded-md" />;
      },
      code({ className, children }) {
        const raw = String(children ?? "");
        const inline = !/\n/.test(raw) && !(className ?? "").startsWith("language-");
        if (inline) {
          return (
            <code className="rounded bg-[#2a2a2a] px-1 py-0.5 font-mono text-[12px] text-[#e5e5e5]">
              {raw}
            </code>
          );
        }
        return (
          <FilesMarkdownCode
            code={raw.replace(/\n$/, "")}
            lang={(className ?? "").replace(/^language-/, "")}
          />
        );
      },
      pre({ children }) {
        return <>{children}</>;
      },
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
        return (
          <h3 className="mb-2 mt-4 text-base font-semibold text-[#e5e5e5] first:mt-0">
            {children}
          </h3>
        );
      },
      ul({ children }) {
        return <ul className="my-1 list-disc pl-5">{children}</ul>;
      },
      ol({ children }) {
        return <ol className="my-1 list-decimal pl-5">{children}</ol>;
      },
      li({ children }) {
        return <li className="my-0.5">{children}</li>;
      },
      blockquote({ children }) {
        return (
          <blockquote className="my-1 border-l-2 border-[#2e2e2e] pl-3 text-[#b3b3b3]">
            {children}
          </blockquote>
        );
      },
      table({ children }) {
        return (
          <div className="my-2 overflow-x-auto">
            <table className="border-collapse text-xs">{children}</table>
          </div>
        );
      },
      th({ children }) {
        return <th className={`${CELL} text-left font-semibold`}>{children}</th>;
      },
      td({ children }) {
        return <td className={CELL}>{children}</td>;
      },
      hr() {
        return <hr className="my-2 border-[#2e2e2e]" />;
      },
    }),
    [path, onOpenFile],
  );

  return (
    <div className="h-full overflow-y-auto">
      <div
        className="mx-auto max-w-3xl px-8 py-6 text-[13px] text-[#cccccc]"
        style={{ zoom: zoom.zoom }}
      >
        <ReactMarkdown
          remarkPlugins={REMARK_PLUGINS}
          rehypePlugins={REHYPE_PLUGINS}
          components={components}
        >
          {text}
        </ReactMarkdown>
      </div>
    </div>
  );
}
