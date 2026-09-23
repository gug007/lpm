export function ReplicaSwitch({ on, className = "" }: { on: boolean; className?: string }) {
  return (
    <span
      className={`relative inline-block h-[18px] w-8 shrink-0 rounded-full ${
        on ? "bg-[#22d3ee]" : "bg-[#333333]"
      } ${className}`}
    >
      <span
        className={`absolute left-[3px] top-[3px] h-3 w-3 rounded-full bg-white ${
          on ? "translate-x-3.5" : ""
        }`}
      />
    </span>
  );
}
