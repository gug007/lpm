"use client";

import { useSyncExternalStore } from "react";
import {
  DOWNLOAD_ENTRIES,
  type DesktopOs,
  type DownloadEntry,
  type DownloadPlatform,
  type MacDownloadPlatform,
} from "./downloads";

export type { MacDownloadPlatform } from "./downloads";
export type DetectedPlatform =
  | MacDownloadPlatform
  | "mac-unknown"
  | "windows-x64"
  | "linux-deb"
  | "linux-rpm"
  | "linux-arm"
  | "ipad"
  | "unsupported";
export type Platform = DetectedPlatform | null;

let cached: Platform | undefined;

// Fedora is the rpm family that reliably meets the packages' glibc 2.35
// floor; RHEL 9 and its rebuilds don't, so the .rpm isn't recommended there.
const RPM_DISTRO_MARKERS = /fedora/;
const ARM_MARKERS = /aarch64|arm64|armv\d/;

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

// Chrome freezes the Linux UA at "x86_64" whatever the CPU, so only browsers
// that still report the real architecture reach "linux-arm". Windows on Arm
// gets the x64 installer, which runs there under emulation.
function getLinuxPackage(userAgent: string): DetectedPlatform {
  if (ARM_MARKERS.test(userAgent)) return "linux-arm";
  return RPM_DISTRO_MARKERS.test(userAgent) ? "linux-rpm" : "linux-deb";
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
  if (isMac) return getMacArchitecture();

  if (userAgent.includes("windows phone")) return "unsupported";
  if (userAgent.includes("windows")) return "windows-x64";

  const isLinuxDesktop =
    userAgent.includes("linux") &&
    !userAgent.includes("android") &&
    !userAgent.includes("cros");
  if (isLinuxDesktop) return getLinuxPackage(userAgent);

  return "unsupported";
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

export function isDownloadPlatform(
  platform: Platform,
): platform is Extract<DetectedPlatform, DownloadPlatform> {
  return (
    isMacDownloadPlatform(platform) ||
    platform === "windows-x64" ||
    platform === "linux-deb" ||
    platform === "linux-rpm"
  );
}

export function detectedOs(platform: Platform): DesktopOs | null {
  switch (platform) {
    case "mac-arm":
    case "mac-intel":
    case "mac-unknown":
      return "macos";
    case "windows-x64":
      return "windows";
    case "linux-deb":
    case "linux-rpm":
    case "linux-arm":
      return "linux";
    default:
      return null;
  }
}

// `null` is the server snapshot, before detection has run. The Apple Silicon
// build is the default, so the delivered HTML carries a real .dmg link and
// detection usually only confirms it.
export function primaryDownload(platform: Platform): DownloadEntry {
  return DOWNLOAD_ENTRIES[isDownloadPlatform(platform) ? platform : "mac-arm"];
}
