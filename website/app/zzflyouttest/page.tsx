"use client";
import { useEffect, useState } from "react";
import { ComposerModelPicker } from "@/components/demo/composer-model-picker";

export default function Page() {
  const [pick, setPick] = useState({ model: "fable", effort: "high" });
  useEffect(() => {
    const t = setTimeout(() => {
      const b = document.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]');
      b?.click();
      setTimeout(() => {
        const rows = document.querySelectorAll('[role="menuitemradio"]');
        (window as unknown as { __rows: number }).__rows = rows.length;
      }, 300);
    }, 600);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="replica-ui" style={{ background: "#111", height: "100vh", position: "relative" }}>
      <div style={{ position: "absolute", left: 500, top: 420 }}>
        <ComposerModelPicker agent="claude" pick={pick} onPick={setPick} />
      </div>
    </div>
  );
}
