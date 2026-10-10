import { useEffect } from "react";
import { create } from "zustand";
import { GetVersion } from "../../bridge/commands";
import { updateTarget } from "../peer/macUpdate";

// This Mac's lpm and the newest release it has heard of, for telling whether a
// paired Mac is behind.
export const useReleaseVersions = create<{ app: string; latest: string }>(() => ({
  app: "",
  latest: "",
}));

let appVersionAsked = false;

function loadAppVersion() {
  if (appVersionAsked) return;
  appVersionAsked = true;
  GetVersion()
    .then((v) => useReleaseVersions.setState({ app: String(v ?? "") }))
    .catch(() => {
      appVersionAsked = false;
    });
}

export function noteLatestRelease(info: { latestVersion?: string } | null | undefined) {
  if (info?.latestVersion) useReleaseVersions.setState({ latest: info.latestVersion });
}

/** The release a paired Mac should be brought up to. Empty until known. */
export function useUpdateTarget(): string {
  useEffect(loadAppVersion, []);
  return useReleaseVersions((s) => updateTarget(s.app, s.latest));
}
