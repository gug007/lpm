import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { compareEnv, mask, type KeyResult } from "./envCompare";
import { readAll, type SyncPair, type Texts } from "./ignoredSyncApi";
import { listNames } from "./syncWords";

const RESULT: Record<KeyResult, string> = {
  Same: "text-[var(--text-muted)]",
  Changed: "text-[var(--accent-amber-text)]",
  Added: "text-[var(--accent-green-text)]",
  Removed: "text-[var(--accent-red-text)]",
};

interface IgnoredEnvCompareProps {
  // The other computers ticked to sync with.
  pairs: SyncPair[];
  path: string;
  // Whose file the sync keeps: "here" or a computer's slug.
  kept: string;
  here: string;
  indent: number;
}

// An .env file side by side on every computer, key by key, values hidden
// until asked.
export function IgnoredEnvCompare({ pairs, path, kept, here, indent }: IgnoredEnvCompareProps) {
  const [texts, setTexts] = useState<Texts | null>(null);
  const [error, setError] = useState("");
  const [reveal, setReveal] = useState(false);
  const project = pairs[0]?.project ?? "";
  const pairsKey = pairs.map((p) => p.slug).join(",");

  useEffect(() => {
    let alive = true;
    readAll(project, pairs, path).then(
      (t) => alive && setTexts(t),
      (err) => alive && setError(String(err)),
    );
    return () => {
      alive = false;
    };
    // `pairsKey` stands for `pairs`, which is rebuilt on every render.
  }, [project, pairsKey, path]);

  const columns = [{ key: "here", name: here }, ...pairs.map((p) => ({ key: p.slug, name: p.machine }))];
  const keptAt = Math.max(0, columns.findIndex((c) => c.key === kept));
  const rows = texts ? compareEnv([texts.here, ...pairs.map((p) => texts.there[p.slug] ?? null)], keptAt) : [];
  const dropped = rows.filter((r) => r.result === "Removed");
  const losing = columns.filter((_, i) => dropped.some((r) => r.values[i] !== undefined)).map((c) => c.name);
  const shown = (v: string | undefined) => (v === undefined ? "—" : reveal ? v : mask(v));
  const grid = { gridTemplateColumns: `minmax(0,1.1fr) repeat(${columns.length}, minmax(0,1fr)) 84px` };

  return (
    <div
      className="mb-2.5 mr-5 mt-1 overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--bg-secondary)]"
      style={{ marginLeft: indent }}
    >
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2 text-[11.5px] text-[var(--text-muted)]">
        <span className="flex-1">{path} by key</span>
        <button
          type="button"
          onClick={() => setReveal((r) => !r)}
          aria-pressed={reveal}
          className="flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
        >
          {reveal ? <EyeOff size={13} /> : <Eye size={13} />}
          {reveal ? "Hide values" : "Show values"}
        </button>
      </div>
      {!texts && !error && (
        <div className="flex items-center gap-2 px-3 py-3 text-[12px] text-[var(--text-muted)]">
          <Loader2 size={13} className="animate-spin" /> Reading the files…
        </div>
      )}
      {error && <div className="px-3 py-3 text-[12px] text-[var(--accent-red-text)]">{error}</div>}
      {texts && (
        <>
          <div className="grid text-[11.5px] text-[var(--text-muted)]" style={grid}>
            <div className="px-3 py-1.5">Key</div>
            {columns.map((c) => (
              <div key={c.key} className="truncate px-3 py-1.5">
                {c.name}
              </div>
            ))}
            <div className="px-3 py-1.5">After sync</div>
          </div>
          {rows.map((r) => (
            <div key={r.key} className="grid border-t border-[var(--border)] font-mono text-[11.5px]" style={grid}>
              <div className="truncate px-3 py-1.5 text-[var(--text-primary)]">{r.key}</div>
              {r.values.map((v, i) => (
                <div key={columns[i].key} className="truncate px-3 py-1.5 text-[var(--text-secondary)]">
                  {shown(v)}
                </div>
              ))}
              <div className={`px-3 py-1.5 font-sans ${RESULT[r.result]}`}>{r.result}</div>
            </div>
          ))}
          {dropped.length > 0 && (
            <div className="border-t border-[var(--border)] px-3 py-2 text-[11.5px] text-[var(--text-secondary)]">
              The sync keeps {columns[keptAt].name}'s file, so {dropped.map((r) => r.key).join(", ")}{" "}
              {dropped.length === 1 ? "goes" : "go"} from {listNames(losing)}. The old file is kept, and Undo puts it
              back.
            </div>
          )}
        </>
      )}
    </div>
  );
}
