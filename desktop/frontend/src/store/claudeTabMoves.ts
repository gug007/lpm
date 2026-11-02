import { useEffect, useRef } from "react";
import { create } from "zustand";

// Claude tabs to move to another account, asked for outside their project's
// view (from the sidebar's account menus) and carried out by that view.
interface ClaudeTabMove {
  projectName: string;
  ids: string[];
  account: string;
}

interface ClaudeTabMovesState {
  pending: ClaudeTabMove[];
}

export const useClaudeTabMoves = create<ClaudeTabMovesState>(() => ({ pending: [] }));

export function requestClaudeTabMoves(projectName: string, ids: string[], account: string): void {
  useClaudeTabMoves.setState((s) => ({ pending: [...s.pending, { projectName, ids, account }] }));
}

// Runs the project's requested moves one tab at a time: each move swaps a
// terminal in the tab tree, and two swaps in flight could each start from a
// tree without the other.
export function useClaudeTabMoveRequests(
  projectName: string,
  move: (terminalId: string, account: string) => Promise<void>,
): void {
  const pending = useClaudeTabMoves((s) => s.pending);
  const moveRef = useRef(move);
  const queue = useRef(Promise.resolve());

  useEffect(() => {
    moveRef.current = move;
  }, [move]);

  useEffect(() => {
    const mine = useClaudeTabMoves.getState().pending.filter((m) => m.projectName === projectName);
    if (mine.length === 0) return;
    useClaudeTabMoves.setState((s) => ({ pending: s.pending.filter((m) => m.projectName !== projectName) }));
    for (const { ids, account } of mine) {
      for (const id of ids) queue.current = queue.current.then(() => moveRef.current(id, account)).catch(() => {});
    }
  }, [pending, projectName]);
}
