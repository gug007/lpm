export function RemoteBadge({ remote }: { remote: string }) {
  return (
    <span className="shrink-0 rounded bg-[#2a2a2a] px-1 py-px text-[9px] font-medium uppercase tracking-wide text-[#919191]">
      {remote}
    </span>
  );
}
