import { useCallback, useEffect, useRef, useState } from "react";
import { locatePath, type LocatedPath } from "../../locate";
import { windowsRules } from "../../path";
import { isWindows } from "../../platform";
import { msysMounts } from "../terminal/msysMounts";
import { resolvePrinted } from "../terminal/pathLinkProvider";
import { typedPath } from "./typedPath";

// Between keystrokes; an SSH project's answer is a round trip to its host.
const LOOK_DELAY_MS = 180;

export type TypedPath =
  | { status: "looking"; path: string }
  | { status: "found"; path: string; at: LocatedPath }
  | { status: "missing"; path: string }
  | { status: "failed"; path: string; message: string };

export async function lookAt(root: string, path: string, onSsh: boolean): Promise<TypedPath | null> {
  try {
    const target = onSsh ? path : resolvePrinted(root, path, isWindows, await msysMounts());
    const at = await locatePath(root, target);
    return at.kind === "missing" ? { status: "missing", path } : { status: "found", path, at };
  } catch (err) {
    const message = String(err);
    // A connected computer too old to be asked: the box filters, as it did.
    return /locate_path/.test(message) ? null : { status: "failed", path, message };
  }
}

// Where the path in the filter box leads, or null when what's there isn't one.
// `settle` answers for the path as typed, without waiting out the pause.
// `opened` is the folder a list opened, as the box then has it: a path even where
// typing it isn't yet one, and nothing more to wait for.
export function useTypedPath(
  root: string,
  query: string,
  enabled: boolean,
  onSsh: boolean,
  opened: string | null = null,
) {
  const isOpened = opened !== null && query === opened;
  const path = !enabled ? null : isOpened ? opened : typedPath(query, !onSsh && windowsRules(root));
  const [answer, setAnswer] = useState<{ path: string; typed: TypedPath | null } | null>(null);
  const asked = useRef<{ root: string; path: string; typed: Promise<TypedPath | null> } | null>(null);

  const ask = useCallback(
    (wanted: string) => {
      const held = asked.current;
      if (held?.path === wanted && held.root === root) return held.typed;
      const typed = lookAt(root, wanted, onSsh);
      asked.current = { root, path: wanted, typed };
      void typed.then((result) => {
        if (asked.current?.typed === typed) setAnswer({ path: wanted, typed: result });
      });
      return typed;
    },
    [root, onSsh],
  );

  useEffect(() => {
    if (!path) {
      asked.current = null;
      setAnswer(null);
      return;
    }
    const timer = setTimeout(() => void ask(path), isOpened ? 0 : LOOK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [path, isOpened, ask]);

  const typed: TypedPath | null = !path
    ? null
    : answer?.path === path
      ? answer.typed
      : { status: "looking", path };
  const settle = useCallback(
    (): Promise<TypedPath | null> => (path ? ask(path) : Promise.resolve(null)),
    [path, ask],
  );
  return { typed, settle };
}
