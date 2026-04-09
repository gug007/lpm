import { useRef, useEffect, useState, useCallback } from "react";
import { ensureLang, tokenizeLines, type Token } from "../highlight";

interface HighlightedYamlEditorProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}

export function HighlightedYamlEditor({ value, onChange, onKeyDown }: HighlightedYamlEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const [tokens, setTokens] = useState<Token[][] | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    ensureLang("yaml").then((ok) => setReady(ok));
  }, []);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    tokenizeLines(value, "yaml").then((t) => {
      if (!cancelled) setTokens(t);
    });
    return () => { cancelled = true; };
  }, [value, ready]);

  const syncScroll = useCallback(() => {
    if (textareaRef.current && preRef.current) {
      preRef.current.scrollTop = textareaRef.current.scrollTop;
      preRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }, []);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  return (
    <div className="relative h-full w-full">
      <pre
        ref={preRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-auto whitespace-pre px-6 py-4 font-mono text-sm leading-relaxed"
        style={{ tabSize: 2, scrollbarWidth: "none" }}
      >
        {tokens
          ? tokens.map((line, i) => (
              <span key={i}>
                {line.map((t, j) => (
                  <span key={j} style={{ color: t.color }}>{t.content}</span>
                ))}
                {"\n"}
              </span>
            ))
          : <span className="text-[var(--text-primary)]">{value}</span>
        }
      </pre>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onScroll={syncScroll}
        spellCheck={false}
        wrap="off"
        className="absolute inset-0 h-full w-full resize-none overflow-auto whitespace-pre bg-transparent px-6 py-4 font-mono text-sm leading-relaxed text-transparent caret-[var(--text-primary)] outline-none selection:bg-[var(--terminal-selection)]"
        style={{ tabSize: 2, caretColor: "var(--text-primary)" }}
      />
    </div>
  );
}
