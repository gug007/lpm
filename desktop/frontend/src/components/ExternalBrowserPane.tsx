import { useEffect, useRef, useState, type FormEvent } from "react";
import { BrowserOpenURL } from "../../bridge/runtime";
import { toTarget } from "./browserTarget";
import { GlobeIcon } from "./icons";

interface ExternalBrowserPaneProps {
  id: string;
  active: boolean;
}

function hostOf(addr: string): string {
  try {
    return new URL(addr).hostname.replace(/^www\./, "") || addr;
  } catch {
    return addr;
  }
}

/** A browser tab whose pages open in the system browser, for platforms where a
 *  page can't be shown inside the pane. */
export function ExternalBrowserPane({ active }: ExternalBrowserPaneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [address, setAddress] = useState("");
  const [opened, setOpened] = useState("");

  useEffect(() => {
    if (active) inputRef.current?.focus();
  }, [active]);

  const go = (e: FormEvent) => {
    e.preventDefault();
    const target = toTarget(address);
    if (!target || target.startsWith("about:")) return;
    BrowserOpenURL(target);
    setOpened(target);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-2 py-1.5">
        <form onSubmit={go} className="flex-1">
          <input
            ref={inputRef}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            placeholder="Search Google or enter a URL…"
            className="h-7 w-full rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-2.5 text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--text-muted)]/60"
          />
        </form>
      </div>
      <div
        onClick={() => inputRef.current?.focus()}
        className="flex min-h-0 flex-1 cursor-text select-none flex-col items-center justify-center gap-4 bg-[var(--bg-primary)] px-6 text-center"
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-muted)] [&>svg]:h-7 [&>svg]:w-7">
          <GlobeIcon />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[15px] font-semibold tracking-tight text-[var(--text-primary)]">
            {opened ? `Opened ${hostOf(opened)}` : "Search the web"}
          </span>
          <span className="text-xs text-[var(--text-muted)]">
            Pages open in your default browser
          </span>
        </div>
        {opened && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              BrowserOpenURL(opened);
            }}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            Open again
          </button>
        )}
      </div>
    </div>
  );
}
