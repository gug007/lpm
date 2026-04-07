import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  type Token,
  DIFF_META_PREFIXES,
  getLang,
  ensureLang,
  tokenizeLines,
} from "../highlight";

interface DiffViewerProps {
  diff: string;
  loading?: boolean;
  filePath?: string;
}

async function highlightUnifiedDiff(
  lines: string[],
  filePath: string,
): Promise<Map<number, Token[]>> {
  const lang = getLang(filePath);
  if (!lang || !(await ensureLang(lang))) return new Map();

  const oldIdx: number[] = [];
  const oldCode: string[] = [];
  const newIdx: number[] = [];
  const newCode: string[] = [];

  lines.forEach((line, i) => {
    const code =
      line.startsWith("+") || line.startsWith("-") || line.startsWith(" ")
        ? line.slice(1)
        : line;
    if (line.startsWith("-")) {
      oldIdx.push(i);
      oldCode.push(code);
    } else if (line.startsWith("+")) {
      newIdx.push(i);
      newCode.push(code);
    } else {
      oldIdx.push(i);
      oldCode.push(code);
      newIdx.push(i);
      newCode.push(code);
    }
  });

  const result = new Map<number, Token[]>();

  if (oldCode.length > 0) {
    const oldTokens = await tokenizeLines(oldCode.join("\n"), lang);
    oldTokens.forEach((tokens, i) => {
      if (i < oldIdx.length) result.set(oldIdx[i], tokens);
    });
  }
  if (newCode.length > 0) {
    const newTokens = await tokenizeLines(newCode.join("\n"), lang);
    newTokens.forEach((tokens, i) => {
      if (i < newIdx.length) result.set(newIdx[i], tokens);
    });
  }

  return result;
}

function renderLine(
  line: string,
  tokens: Token[] | undefined,
): ReactNode {
  const isAdd = line.startsWith("+");
  const isDel = line.startsWith("-");
  const prefix = isAdd ? "+" : isDel ? "-" : line.startsWith(" ") ? " " : "";

  if (tokens && tokens.length > 0) {
    return (
      <>
        {prefix}
        {tokens.map((t, i) => (
          <span key={i} style={t.color ? { color: t.color } : undefined}>
            {t.content}
          </span>
        ))}
      </>
    );
  }
  return line || " ";
}

export function DiffViewer({ diff, loading, filePath }: DiffViewerProps) {
  const [tokenMap, setTokenMap] = useState<Map<number, Token[]>>(new Map());

  const lines = useMemo(
    () =>
      diff
        .split("\n")
        .filter(
          (l) =>
            !l.startsWith("@@") &&
            !DIFF_META_PREFIXES.some((p) => l.startsWith(p)),
        ),
    [diff],
  );

  useEffect(() => {
    setTokenMap(new Map());
    if (!filePath || lines.length === 0) return;
    let cancelled = false;
    highlightUnifiedDiff(lines, filePath).then((result) => {
      if (!cancelled) setTokenMap(result);
    });
    return () => {
      cancelled = true;
    };
  }, [lines, filePath]);

  if (loading) {
    return (
      <div className="px-3 py-3 text-[11px] text-[var(--text-muted)]">
        Loading diff...
      </div>
    );
  }

  if (!diff.trim()) {
    return (
      <div className="px-3 py-3 text-[11px] text-[var(--text-muted)]">
        No changes
      </div>
    );
  }

  return (
    <pre className="max-h-[250px] overflow-auto border-t border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-[11px] font-mono leading-[1.6]">
      {lines.map((line, i) => {
        const tokens = tokenMap.get(i);
        const isAdd = line.startsWith("+");
        const isDel = line.startsWith("-");
        const bg = isAdd
          ? "bg-green-500/10"
          : isDel
            ? "bg-red-500/10"
            : "";
        const fallbackColor = isAdd
          ? "text-green-400"
          : isDel
            ? "text-red-400"
            : "text-[var(--text-muted)]";

        return (
          <div key={i} className={`${bg} ${tokens ? "" : fallbackColor}`}>
            {renderLine(line, tokens)}
          </div>
        );
      })}
    </pre>
  );
}
