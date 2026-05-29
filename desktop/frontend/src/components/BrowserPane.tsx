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
import { ChevronLeftIcon, ChevronRightIcon, RefreshIcon, SunIcon, MoonIcon } from "./icons";

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

export function BrowserPane({ id, active }: BrowserPaneProps) {
  const holeRef = useRef<HTMLDivElement>(null);
  const openedRef = useRef(false);
  const lastRectRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const [address, setAddress] = useState("");
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
      if (!openedRef.current) {
        openedRef.current = true;
        lastRectRef.current = rect;
        OpenBrowser(id, "", rect.x, rect.y, rect.w, rect.h);
        SetBrowserTheme(id, darkRef.current);
        return;
      }
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
  }, [shown, id]);

  useEffect(() => () => { CloseBrowser(id); }, [id]);

  useEffect(() => {
    if (openedRef.current) SetBrowserTheme(id, dark);
  }, [id, dark]);

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
    const el = holeRef.current;
    if (!openedRef.current && el) {
      const r = el.getBoundingClientRect();
      openedRef.current = true;
      OpenBrowser(id, target, r.left, r.top, r.width, r.height);
    } else {
      NavigateBrowser(id, target);
    }
  };

  const navBtn =
    "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] [&>svg]:h-4 [&>svg]:w-4";

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
      {/* The native browser webview is positioned over this placeholder. */}
      <div ref={holeRef} className="min-h-0 flex-1 bg-[var(--bg-primary)]" />
    </div>
  );
}
