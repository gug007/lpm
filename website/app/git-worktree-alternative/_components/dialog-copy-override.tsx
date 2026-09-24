"use client";

import { useEffect, useRef } from "react";
import DialogPromptBox from "./dialog-prompt-box";
import DialogSegmented from "./dialog-segmented";
import DialogTargetField from "./dialog-target-field";
import {
  COPY_RUN_OPTIONS,
  type CopyRunMode,
  type RunMode,
} from "./dialog-data";
import { HELPER_TEXT } from "./dialog-styles";

export default function DialogCopyOverride({
  id,
  label,
  override,
  onChange,
}: {
  id: string;
  label: string;
  override: RunMode | null;
  onChange: (next: CopyRunMode) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // The copies list has a max height, so a panel opened on a lower row would
  // otherwise unfold out of view.
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "nearest" });
  }, [override]);

  return (
    <div
      ref={ref}
      id={id}
      className="menu-pop col-span-3 mb-1 mt-1 border-l border-[var(--border)] pl-3 sm:ml-[1.625rem]"
    >
      <DialogSegmented
        label={`Run on ${label}`}
        value={override ?? "default"}
        options={COPY_RUN_OPTIONS}
        onChange={onChange}
      />
      {override === null ? (
        <p className={`mt-2 ${HELPER_TEXT}`}>
          Inherits the shared default above.
        </p>
      ) : override === "none" ? (
        <p className={`mt-2 ${HELPER_TEXT}`}>Nothing runs on this copy.</p>
      ) : (
        <>
          <DialogTargetField mode={override} />
          <DialogPromptBox placeholder="Prompt for an AI agent (optional)…" />
        </>
      )}
    </div>
  );
}
