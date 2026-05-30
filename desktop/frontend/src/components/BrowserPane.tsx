import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  OpenBrowser,
  SetBrowserBounds,
  SetBrowserTheme,
  NavigateBrowser,
  BrowserBack,
  BrowserForward,
  BrowserReload,
  HideBrowser,
  CloseBrowser,
} from "../../bridge/commands";
import { EventsOn } from "../../bridge/runtime";
import { useOverlayStore } from "../store/overlay";
import { getSettings, saveSettings } from "../store/settings";
import { isDarkTheme } from "../theme";
import { ChevronLeftIcon, ChevronRightIcon, RefreshIcon, SunIcon, MoonIcon, GlobeIcon } from "./icons";

interface BrowserPaneProps {
  id: string;
  active: boolean;
}

// Precedence: explicit scheme → localhost (http) → domain-shaped (https) → Google search.
function toTarget(raw: string): string {
  const v = raw.trim();
  if (!v) return "";
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(v) || v.startsWith("about:")) return v;
  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?(\/|$)/.test(v)) return "http://" + v;
  if (!/\s/.test(v) && /^[^\s/]+\.[a-z]{2,}([:/?#]|$)/i.test(v)) return "https://" + v;
  return "https://www.google.com/search?q=" + encodeURIComponent(v);
}

function hostOf(addr: string): string {
  try {
    return new URL(addr).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function BrowserPane({ id, active }: BrowserPaneProps) {
  const holeRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const openedRef = useRef(false);
  const lastRectRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const [address, setAddress] = useState("");
  const [opened, setOpened] = useState(false);
  const overlayOpen = useOverlayStore((s) => s.count > 0);
  const [dark, setDark] = useState(() => {
    const remembered = getSettings().browserTheme;
    return remembered ? remembered === "dark" : isDarkTheme(getSettings().theme);
  });
  const darkRef = useRef(dark);
  darkRef.current = dark;

  // The native webview would cover any React-DOM overlay, so only show it when
  // this tab is active and nothing is occluding it.
  const shown = active && !overlayOpen;

  useEffect(() => {
    if (!opened) return; // lazy: no webview to place until the first navigation
    if (!shown) {
      HideBrowser(id);
      lastRectRef.current = null; // force a reposition on re-show (it's parked offscreen)
      return;
    }
    let raf = 0;
    const sync = () => {
      const el = holeRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const rect = { x: r.left, y: r.top, w: r.width, h: r.height };
      const last = lastRectRef.current;
      if (last && last.x === rect.x && last.y === rect.y && last.w === rect.w && last.h === rect.h) {
        return; // unchanged — skip the IPC (e.g. unrelated scrolling)
      }
      lastRectRef.current = rect;
      SetBrowserBounds(id, rect.x, rect.y, rect.w, rect.h);
    };
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(sync);
    };
    schedule();
    const ro = new ResizeObserver(schedule);
    if (holeRef.current) ro.observe(holeRef.current);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true); // capture: any scroll container
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [opened, shown, id]);

  useEffect(() => () => { CloseBrowser(id); }, [id]);

  useEffect(() => {
    if (openedRef.current) SetBrowserTheme(id, dark);
  }, [id, dark]);

  useEffect(() => {
    if (active && !opened) inputRef.current?.focus();
  }, [active, opened]);

  useEffect(
    () =>
      EventsOn("browser-url-changed", (p: { id: string; url: string }) => {
        if (p?.id === id && p.url && p.url !== "about:blank") setAddress(p.url);
      }),
    [id],
  );

  const go = (e: FormEvent) => {
    e.preventDefault();
    const target = toTarget(address);
    if (!target) return;
    if (openedRef.current) {
      NavigateBrowser(id, target);
      return;
    }
    const r = holeRef.current?.getBoundingClientRect();
    const rect = r ? { x: r.left, y: r.top, w: r.width, h: r.height } : { x: 0, y: 0, w: 1, h: 1 };
    lastRectRef.current = rect;
    openedRef.current = true;
    OpenBrowser(id, target, rect.x, rect.y, rect.w, rect.h);
    SetBrowserTheme(id, darkRef.current);
    setOpened(true);
  };

  const navBtn =
    "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] [&>svg]:h-4 [&>svg]:w-4";

  // The content area mirrors the chosen BROWSER theme (not the app theme), so a
  // light browser shows a light surface here instead of the dark app background.
  const surface = dark ? "bg-[#1c1c1e]" : "bg-white";
  const badge = dark
    ? "border-white/10 bg-white/[0.06] text-white/55"
    : "border-black/10 bg-black/[0.04] text-black/45";
  const emptyTitle = dark ? "text-white/85" : "text-black/80";
  const emptySub = dark ? "text-white/45" : "text-black/45";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-2 py-1.5">
        <button className={navBtn} onClick={() => BrowserBack(id)} title="Back" aria-label="Back">
          <ChevronLeftIcon />
        </button>
        <button className={navBtn} onClick={() => BrowserForward(id)} title="Forward" aria-label="Forward">
          <ChevronRightIcon />
        </button>
        <button className={navBtn} onClick={() => BrowserReload(id)} title="Reload" aria-label="Reload">
          <RefreshIcon />
        </button>
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
        <button
          className={navBtn}
          onClick={() =>
            setDark((d) => {
              const next = !d;
              void saveSettings({ browserTheme: next ? "dark" : "light" });
              return next;
            })
          }
          title={dark ? "Switch browser to light" : "Switch browser to dark"}
          aria-label="Toggle browser theme"
        >
          {dark ? <SunIcon /> : <MoonIcon />}
        </button>
      </div>
      {/* The native webview floats over this hole once a page is opened. Before
          that — and while it's parked behind an overlay — the React layer shows. */}
      <div ref={holeRef} className={`relative min-h-0 flex-1 ${surface}`}>
        {!opened ? (
          <div
            onClick={() => inputRef.current?.focus()}
            className="absolute inset-0 flex cursor-text select-none flex-col items-center justify-center gap-4 px-6 text-center"
          >
            <div className={`flex h-16 w-16 items-center justify-center rounded-2xl border ${badge} [&>svg]:h-7 [&>svg]:w-7`}>
              <GlobeIcon />
            </div>
            <div className="flex flex-col gap-1">
              <span className={`text-sm font-medium ${emptyTitle}`}>Search the web</span>
              <span className={`text-xs ${emptySub}`}>Type a search or enter a web address to get started</span>
            </div>
          </div>
        ) : (
          !shown && (
            <div className={`pointer-events-none absolute inset-0 flex select-none flex-col items-center justify-center gap-3 ${emptySub}`}>
              <div className={`flex h-14 w-14 items-center justify-center rounded-2xl border ${badge} [&>svg]:h-6 [&>svg]:w-6`}>
                <GlobeIcon />
              </div>
              <span className={`text-xs font-medium tracking-wide ${emptyTitle}`}>{hostOf(address) || "New tab"}</span>
            </div>
          )
        )}
      </div>
    </div>
  );
}
