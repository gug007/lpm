import { memo, useEffect, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { ensureLang, tokenizeLines, type Token } from "../highlight";

interface MessageMarkdownProps {
  text: string;
}

export const MessageMarkdown = memo(function MessageMarkdown({ text }: MessageMarkdownProps) {
  return (
    <div className="markdown-body text-sm text-[var(--text-primary)]">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
});

const components: Components = {
  code({ className, children, ...rest }) {
    const raw = String(children ?? "");
    const inline = !/\n/.test(raw) && !(className ?? "").startsWith("language-");
    if (inline) {
      return (
        <code
          className="rounded bg-[var(--bg-hover)] px-1 py-0.5 font-mono text-[12px] text-[var(--text-primary)]"
          {...rest}
        >
          {children}
        </code>
      );
    }
    const lang = (className ?? "").replace(/^language-/, "");
    return <CodeBlock code={raw.replace(/\n$/, "")} lang={lang} />;
  },
  pre({ children }) {
    return <>{children}</>;
  },
  a({ children, href, ...rest }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[var(--accent-blue,#3b82f6)] underline hover:opacity-80"
        {...rest}
      >
        {children}
      </a>
    );
  },
  p({ children }) {
    return <p className="my-1 whitespace-pre-wrap break-words">{children}</p>;
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
  h1({ children }) {
    return <h1 className="my-2 text-base font-semibold">{children}</h1>;
  },
  h2({ children }) {
    return <h2 className="my-2 text-[15px] font-semibold">{children}</h2>;
  },
  h3({ children }) {
    return <h3 className="my-1 text-sm font-semibold">{children}</h3>;
  },
  blockquote({ children }) {
    return (
      <blockquote className="my-1 border-l-2 border-[var(--border)] pl-3 text-[var(--text-secondary)]">
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
    return <th className="border border-[var(--border)] px-2 py-1 text-left font-semibold">{children}</th>;
  },
  td({ children }) {
    return <td className="border border-[var(--border)] px-2 py-1">{children}</td>;
  },
  hr() {
    return <hr className="my-2 border-[var(--border)]" />;
  },
};

interface CodeBlockProps {
  code: string;
  lang: string;
}

function CodeBlock({ code, lang }: CodeBlockProps) {
  const [lines, setLines] = useState<Token[][] | null>(null);

  useEffect(() => {
    if (!lang) {
      setLines(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const ok = await ensureLang(lang);
      if (!ok) return;
      try {
        const result = await tokenizeLines(code, lang);
        if (!cancelled) setLines(result);
      } catch {
        /* fall through to plain rendering */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, lang]);

  return (
    <div className="my-2 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--bg-code,var(--bg-hover))]">
      {lang && (
        <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-1 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
          <span>{lang}</span>
          <button
            onClick={() => navigator.clipboard.writeText(code)}
            className="rounded px-1 text-[10px] hover:bg-[var(--bg-primary)] hover:text-[var(--text-primary)]"
            title="Copy"
          >
            copy
          </button>
        </div>
      )}
      <pre className="overflow-x-auto px-3 py-2 text-[12.5px] leading-5">
        <code className="font-mono">
          {lines
            ? lines.map((tokens, i) => (
                <div key={i}>
                  {tokens.length === 0 ? (
                    <span>&nbsp;</span>
                  ) : (
                    tokens.map((t, j) => (
                      <span key={j} style={t.color ? { color: t.color } : undefined}>
                        {t.content}
                      </span>
                    ))
                  )}
                </div>
              ))
            : code}
        </code>
      </pre>
    </div>
  );
}
