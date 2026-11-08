"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

// A chapter picked anywhere on the page, for the player to start from. `run`
// counts the picks, so picking the same chapter again starts it over.
type Seek = { start: number; run: number };

type SeekState = { seek: Seek | null; seekTo: (start: number) => void };

const SeekContext = createContext<SeekState>({
  seek: null,
  seekTo: () => {},
});

export function LessonSeekProvider({ children }: { children: ReactNode }) {
  const [seek, setSeek] = useState<Seek | null>(null);
  const seekTo = useCallback(
    (start: number) =>
      setSeek((last) => ({ start, run: (last?.run ?? 0) + 1 })),
    [],
  );
  const value = useMemo(() => ({ seek, seekTo }), [seek, seekTo]);
  return <SeekContext value={value}>{children}</SeekContext>;
}

export function useLessonSeek(): SeekState {
  return useContext(SeekContext);
}
