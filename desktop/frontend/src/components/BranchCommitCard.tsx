import type { HistoryCommit } from "../gitHistory";
import { BranchCommitRow } from "./BranchCommitRow";

interface BranchCommitCardProps {
  commits: HistoryCommit[];
}

/** What resting on the branch button shows: its last commits. */
export function BranchCommitCard({ commits }: BranchCommitCardProps) {
  return (
    <span className="flex w-[340px] max-w-full flex-col gap-2 leading-snug">
      {commits.map((commit) => (
        <BranchCommitRow key={commit.hash} commit={commit} latest={commit === commits[0]} />
      ))}
    </span>
  );
}
