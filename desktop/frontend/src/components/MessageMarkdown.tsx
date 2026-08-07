import {
  createContext,
  memo,
  useContext,
  useEffect,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { BrowserOpenURL } from "../../bridge/runtime";
import { ensureLang, tokenizeLines, type Token } from "../highlight";

interface MessageMarkdownProps {
  /** 1-based source line being read aloud, tinted while it plays. */
  speakingLine?: number | null;
  text: string;
}

const URL_RE = /(https?:\/\/[^\s<>"'`]+)/g;

function openExternal(e: MouseEvent<HTMLAnchorElement>, url: string) {
  e.preventDefault();
  BrowserOpenURL(url);
}

function renderWithLinks(text: string): ReactNode {
  if (!text.includes("http")) return text;
  const parts = text.split(URL_RE);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <a
        key={i}
        href={part}
        onClick={(e) => openExternal(e, part)}
        className="underline"
        style={{ color: "inherit" }}
      >
        {part}
      </a>
    ) : (
      part
    ),
  );
}

/// The source line currently being read aloud, or null. Passed by context
/// rather than prop because `components` is a module-level map that
/// react-markdown owns — it never sees this component's props.
const SpeakingLineContext = createContext<number | null>(null);

/// Blocks carry their source position, so the one being spoken can be tinted
/// without changing how the markdown is parsed or rendered.
function useIsSpeaking(node: unknown): boolean {
  const speaking = useContext(SpeakingLineContext);
  return coversLine(node, speaking);
}

function coversLine(node: unknown, speaking: number | null): boolean {
  if (speaking == null) return false;
  const start = (node as { position?: { start?: { line?: number }; end?: { line?: number } } })
    ?.position;
  const from = start?.start?.line;
  const to = start?.end?.line ?? from;
  return from != null && to != null && speaking >= from && speaking <= to;
}

const SPEAKING_CLASS = " rounded bg-[var(--accent-blue)]/15 transition-colors";

/// Called from inside the `components` map, which react-markdown invokes as
/// React components — so the context read is a legal hook call.
function speakingClass(node: unknown): string {
  return useIsSpeaking(node) ? SPEAKING_CLASS : "";
}

export const MessageMarkdown = memo(function MessageMarkdown({
  text,
  speakingLine = null,
}: MessageMarkdownProps) {
  return (
    <div className="markdown-body select-text text-sm text-[var(--text-primary)]">
      <SpeakingLineContext.Provider value={speakingLine}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {text}
        </ReactMarkdown>
      </SpeakingLineContext.Provider>
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
          className="select-text rounded bg-[var(--bg-hover)] px-1 py-0.5 font-mono text-[12px] text-[var(--text-primary)]"
          {...rest}
        >
          {renderWithLinks(raw)}
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
        onClick={(e) => href && openExternal(e, href)}
        className="text-[var(--accent-blue,#3b82f6)] underline hover:opacity-80"
        {...rest}
      >
        {children}
      </a>
    );
  },
  p({ children, node }) {
    return (
      <p className={`my-1 whitespace-pre-wrap break-words${speakingClass(node)}`}>{children}</p>
    );
  },
  ul({ children }) {
    return <ul className="my-1 list-disc pl-5">{children}</ul>;
  },
  ol({ children }) {
    return <ol className="my-1 list-decimal pl-5">{children}</ol>;
  },
  li({ children, node }) {
    return <li className={`my-0.5${speakingClass(node)}`}>{children}</li>;
  },
  h1({ children, node }) {
    return <h1 className={`my-2 text-base font-semibold${speakingClass(node)}`}>{children}</h1>;
  },
  h2({ children, node }) {
    return <h2 className={`my-2 text-[15px] font-semibold${speakingClass(node)}`}>{children}</h2>;
  },
  h3({ children, node }) {
    return <h3 className={`my-1 text-sm font-semibold${speakingClass(node)}`}>{children}</h3>;
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
      <pre className="select-text overflow-x-auto px-3 py-2 text-[12.5px] leading-5">
        <code className="font-mono">
          {lines
            ? lines.map((tokens, i) => (
                <div key={i}>
                  {tokens.length === 0 ? (
                    <span>&nbsp;</span>
                  ) : (
                    tokens.map((t, j) => (
                      <span key={j} style={t.color ? { color: t.color } : undefined}>
                        {renderWithLinks(t.content)}
                      </span>
                    ))
                  )}
                </div>
              ))
            : renderWithLinks(code)}
        </code>
      </pre>
    </div>
  );
}
