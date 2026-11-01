import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GitScanSecrets } from "../../bridge/commands";
import { findingKey, openFindings, type SecretFinding } from "../secretScan";

export interface SecretCheck {
  // What is still in the way of the commit the user last asked for.
  findings: SecretFinding[];
  checking: boolean;
  /** Scans `paths`; true when the commit can go ahead now. Otherwise the
   *  findings show and `next` waits for "Commit anyway". */
  guard: (paths: string[], next: () => void) => Promise<boolean>;
  ignore: (finding: SecretFinding) => void;
  commitAnyway: () => void;
  dismiss: () => void;
}

/** The commit dialog's look for credentials before a commit. Ignored lines
 *  hold for as long as the dialog stays open. */
export function useSecretCheck(
  projectPath: string,
  open: boolean,
  selected: ReadonlySet<string>,
): SecretCheck {
  const [found, setFound] = useState<SecretFinding[]>([]);
  const [ignored, setIgnored] = useState<ReadonlySet<string>>(new Set());
  const [checking, setChecking] = useState(false);
  const ignoredRef = useRef(ignored);
  ignoredRef.current = ignored;
  const pending = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!open) return;
    setFound([]);
    setIgnored(new Set());
    pending.current = null;
  }, [open, projectPath]);

  const findings = useMemo(() => openFindings(found, selected, ignored), [found, selected, ignored]);

  const guard = useCallback(
    async (paths: string[], next: () => void) => {
      setChecking(true);
      // A computer on an older lpm has no scan to run; that mustn't stop a commit.
      const scanned: SecretFinding[] = await GitScanSecrets(projectPath, paths).catch(() => []);
      setChecking(false);
      setFound(scanned);
      if (openFindings(scanned, new Set(paths), ignoredRef.current).length === 0) {
        pending.current = null;
        return true;
      }
      pending.current = next;
      return false;
    },
    [projectPath],
  );

  const ignore = useCallback((finding: SecretFinding) => {
    setIgnored((prev) => new Set(prev).add(findingKey(finding)));
  }, []);

  const commitAnyway = useCallback(() => {
    const next = pending.current;
    pending.current = null;
    setFound([]);
    next?.();
  }, []);

  const dismiss = useCallback(() => {
    pending.current = null;
    setFound([]);
  }, []);

  return { findings, checking, guard, ignore, commitAnyway, dismiss };
}
