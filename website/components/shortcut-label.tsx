"use client";

import { pcShortcut } from "@/lib/shortcuts";
import { detectedOs, usePlatform } from "@/lib/use-platform";

function describe(mac: string): string {
  const windows = pcShortcut(mac);
  const linux = pcShortcut(mac, true);
  if (windows === mac) return mac;
  const pc =
    windows === linux
      ? `Windows and Linux: ${windows}`
      : `Windows: ${windows} · Linux: ${linux}`;
  return `macOS: ${mac} · ${pc}`;
}

// Shortcuts are written the macOS way; Windows and Linux visitors see their
// own chord once detection has run, and the title names every form.
export function ShortcutLabel({ mac }: { mac: string }) {
  const os = detectedOs(usePlatform());
  const shown =
    os === "windows" || os === "linux" ? pcShortcut(mac, os === "linux") : mac;
  return <span title={describe(mac)}>{shown}</span>;
}
