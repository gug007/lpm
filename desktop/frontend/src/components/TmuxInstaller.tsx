import { useState, useEffect, useRef } from "react";
import { EventsOn } from "../../wailsjs/runtime/runtime";

interface Props {
  onInstalled: () => void;
  installTmux: () => Promise<void>;
}

export function TmuxInstaller({ onInstalled, installTmux }: Props) {
  const [lines, setLines] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto" });
  }, [lines]);

  useEffect(() => {
    const cancel = EventsOn("tmux-install-output", (line: string) => {
      setLines((prev) => [...prev, line]);
    });

    installTmux()
      .then(() => onInstalled())
      .catch((err) => setError(String(err)));

    return cancel;
  }, [onInstalled, installTmux]);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[var(--bg-primary)]">
      <div className="wails-drag absolute inset-x-0 top-0 h-8" />
      <div className="w-full max-w-lg px-6">
        <h2 className="mb-1 text-lg font-semibold text-[var(--text-primary)]">
          Installing tmux
        </h2>
        <p className="mb-4 text-sm text-[var(--text-secondary)]">
          tmux is required to run your projects. This only happens once.
        </p>

        <div className="mb-4 h-64 overflow-y-auto rounded-lg bg-[var(--bg-secondary)] p-4 font-mono text-xs leading-5 text-[var(--text-secondary)]">
          {lines.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
          <div ref={bottomRef} />
        </div>

        {error ? (
          <div className="space-y-3">
            <div className="rounded-lg bg-[var(--accent-red)] p-3 text-sm text-white">
              Installation failed
            </div>
            <p className="text-sm text-[var(--text-secondary)]">
              Please install tmux manually by running this command in your terminal:
            </p>
            <code className="block rounded-lg bg-[var(--bg-secondary)] px-4 py-2 text-sm text-[var(--text-primary)]">
              brew install tmux
            </code>
            <p className="text-xs text-[var(--text-secondary)]">
              If you don't have Homebrew, install it from{" "}
              <span className="text-[var(--text-primary)]">https://brew.sh</span>{" "}
              first. After installing tmux, relaunch the app.
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            Please wait…
          </div>
        )}
      </div>
    </div>
  );
}
