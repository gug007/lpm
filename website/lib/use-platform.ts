"use client";

import { useSyncExternalStore } from "react";

export type Platform = "mac-arm" | "mac-intel" | null;

let cached: Platform | undefined;

function detect(): Platform {
  const ua = navigator.userAgent.toLowerCase();
  const navPlat = navigator.platform?.toLowerCase() || "";
  if (!ua.includes("mac") && !navPlat.includes("mac")) return null;

  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (gl) {
      const dbg = gl.getExtension("WEBGL_debug_renderer_info");
      const renderer = dbg
        ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)).toLowerCase()
        : "";
      if (!renderer.includes("apple")) return "mac-intel";
    }
  } catch {}
  return "mac-arm";
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
