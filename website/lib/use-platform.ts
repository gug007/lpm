"use client";

import { useSyncExternalStore } from "react";

export type MacDownloadPlatform = "mac-arm" | "mac-intel";
export type DetectedPlatform =
  | MacDownloadPlatform
  | "mac-unknown"
  | "ipad"
  | "unsupported";
export type Platform = DetectedPlatform | null;

let cached: Platform | undefined;

function getMacArchitecture(): MacDownloadPlatform | "mac-unknown" {
  const intelRendererMarkers = ["intel", "amd", "ati", "radeon", "nvidia"];

  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (gl) {
      const dbg = gl.getExtension("WEBGL_debug_renderer_info");
      const renderer = dbg
        ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)).toLowerCase()
        : "";
      if (intelRendererMarkers.some((marker) => renderer.includes(marker))) {
        return "mac-intel";
      }
      if (
        renderer.includes("apple silicon") ||
        /\bapple m\d+\b/.test(renderer)
      ) {
        return "mac-arm";
      }
    }
  } catch {}

  return "mac-unknown";
}

function detect(): DetectedPlatform {
  const userAgent = navigator.userAgent.toLowerCase();
  const navigatorPlatform = navigator.platform?.toLowerCase() || "";
  const isIPad =
    userAgent.includes("ipad") ||
    (navigatorPlatform.startsWith("mac") && navigator.maxTouchPoints > 1);

  if (isIPad) return "ipad";
  if (userAgent.includes("iphone") || userAgent.includes("ipod")) {
    return "unsupported";
  }

  const isMac =
    userAgent.includes("macintosh") || navigatorPlatform.startsWith("mac");
  if (!isMac) return "unsupported";

  return getMacArchitecture();
}

function subscribe() {
  return () => {};
}

function getSnapshot(): Platform {
  if (cached === undefined) cached = detect();
  return cached;
}

function getServerSnapshot(): Platform {
  return null;
}

export function usePlatform(): Platform {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function isMacDownloadPlatform(
  platform: Platform,
): platform is MacDownloadPlatform {
  return platform === "mac-arm" || platform === "mac-intel";
}
