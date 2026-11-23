import { useEffect, useState } from "react";
import { GitHostInfo } from "../bridge/commands";

// Where a checkout's origin lives (githost.rs), so the pull request flows say
// "merge request" and "!128" on GitLab and stay word for word on GitHub.
export type ForgeKind = "github" | "gitlab";

export interface GitHost {
  kind: ForgeKind;
  host: string;
  cliFound: boolean;
}

export interface ForgeWords {
  kind: ForgeKind;
  site: string;
  // "PR" / "MR"
  short: string;
  noun: string;
  // "Pull request" / "Merge request", to start a sentence.
  sentence: string;
  title: string;
  ref: (n: number) => string;
  // Where a pull request's CI lives under its URL.
  checksPath: string;
  cliName: string;
  cliUrl: string;
}

const GITHUB: ForgeWords = {
  kind: "github",
  site: "GitHub",
  short: "PR",
  noun: "pull request",
  sentence: "Pull request",
  title: "Pull Request",
  ref: (n) => `#${n}`,
  checksPath: "checks",
  cliName: "GitHub CLI (gh)",
  cliUrl: "https://cli.github.com",
};

const GITLAB: ForgeWords = {
  kind: "gitlab",
  site: "GitLab",
  short: "MR",
  noun: "merge request",
  sentence: "Merge request",
  title: "Merge Request",
  ref: (n) => `!${n}`,
  checksPath: "pipelines",
  cliName: "GitLab CLI (glab)",
  cliUrl: "https://gitlab.com/gitlab-org/cli",
};

export function forgeWords(kind?: string | null): ForgeWords {
  return kind === "gitlab" ? GITLAB : GITHUB;
}

/** The words for a pull request lpm already has, from its `host`. */
export function prWords(pr: { host?: string } | null | undefined): ForgeWords {
  return forgeWords(pr?.host);
}

/** Where a pull request opens, as a sentence names it: a GitLab's own host. */
export function siteName(host: GitHost | null): string {
  const words = forgeWords(host?.kind);
  return words.kind === "gitlab" && host?.host ? host.host : words.site;
}

/** What to run to sign the CLI in: a self-hosted GitLab names its host. */
export function cliLoginCommand(host: GitHost | null): string {
  if (host?.kind !== "gitlab") return "gh auth login";
  return host.host && host.host !== "gitlab.com"
    ? `glab auth login --hostname ${host.host}`
    : "glab auth login";
}

const known = new Map<string, GitHost>();

/** Asks once per checkout, then answers from memory while it asks again. Null
 *  until it knows, and when the computer can't say (an older paired lpm): the
 *  caller then treats it as GitHub, as every remote was before. */
export async function loadGitHost(projectPath: string): Promise<GitHost | null> {
  const info = await GitHostInfo(projectPath).catch(() => null);
  if (info) known.set(projectPath, info);
  return info ?? known.get(projectPath) ?? null;
}

function knownGitHost(projectPath: string): GitHost | null {
  return known.get(projectPath) ?? null;
}

export function useGitHost(projectPath: string, active = true): GitHost | null {
  const [host, setHost] = useState<GitHost | null>(() => knownGitHost(projectPath));
  useEffect(() => {
    setHost(knownGitHost(projectPath));
    if (!active || !projectPath) return;
    let cancelled = false;
    void loadGitHost(projectPath).then((info) => {
      if (!cancelled) setHost(info);
    });
    return () => {
      cancelled = true;
    };
  }, [projectPath, active]);
  return host;
}
