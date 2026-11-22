import { useEffect, useState } from "react";
import { CopySpace } from "../../bridge/commands";
import type { CopySpaceInfo } from "../diskSpace";
import { measureEach } from "./measureEach";

/** Each copy's disk use: absent while it's measured, null when it can't be (an
 *  SSH project, a folder that's gone). `remeasure` measures them again. */
export function useCopySpaces(names: readonly string[]): {
  spaces: ReadonlyMap<string, CopySpaceInfo | null>;
  remeasure: () => void;
} {
  const [spaces, setSpaces] = useState<Map<string, CopySpaceInfo | null>>(() => new Map());
  const [round, setRound] = useState(0);
  const key = `${round}\n${names.join("\n")}`;

  useEffect(() => {
    setSpaces(new Map());
    return measureEach<CopySpaceInfo>(names, CopySpace, (name, space) =>
      setSpaces((prev) => new Map(prev).set(name, space)),
    );
    // `key` stands for `names`: a new array with the same copies measures nothing new.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { spaces, remeasure: () => setRound((n) => n + 1) };
}
