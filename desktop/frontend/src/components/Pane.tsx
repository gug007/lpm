import { useRef, useEffect } from "react";

export function Pane({ label, output }: { label?: string; output: string }) {
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [output]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {label && (
        <div className="border-b border-[#333] bg-[#111] px-3 py-1">
          <span className="text-[10px] font-medium text-[#666]">{label}</span>
        </div>
      )}
      <pre
        ref={ref}
        className="flex-1 overflow-auto whitespace-pre bg-[#0d0d0d] p-3 font-mono text-[11px] leading-relaxed text-[#ccc]"
      >
        {output || "Waiting for output..."}
      </pre>
    </div>
  );
}
