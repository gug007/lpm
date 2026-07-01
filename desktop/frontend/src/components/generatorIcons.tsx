import { useId, type ReactElement } from "react";
import type { GeneratorIcon } from "../types";
import { useImageDataUrl } from "./imageDataUrl";

export function NextjsIcon({ size = 24 }: { size?: number }) {
  const maskId = `nextjs-${useId().replace(/:/g, "")}`;
  return (
    <svg width={size} height={size} viewBox="0 0 180 180" aria-hidden>
      <mask id={maskId} style={{ maskType: "alpha" }} maskUnits="userSpaceOnUse" x="0" y="0" width="180" height="180">
        <circle cx="90" cy="90" r="90" fill="black" />
      </mask>
      <g mask={`url(#${maskId})`}>
        <circle cx="90" cy="90" r="90" fill="black" />
        <path d="M149.5 157.5 69 54H54v72h12V69l74 95z" fill="white" />
        <rect x="115" y="54" width="12" height="72" fill="white" />
      </g>
    </svg>
  );
}

const BRAND_ICONS: Record<string, (props: { size?: number }) => ReactElement> = {
  nextjs: NextjsIcon,
};

function ImageIcon({ path, size }: { path: string; size: number }) {
  const { url, failed } = useImageDataUrl(path);
  if (!url || failed) {
    return <div style={{ width: size, height: size, borderRadius: 8, background: "var(--bg-active)" }} />;
  }
  return <img src={url} alt="" width={size} height={size} style={{ borderRadius: 8, objectFit: "cover" }} />;
}

export function GeneratorIconView({ icon, size = 32 }: { icon: GeneratorIcon; size?: number }) {
  if (icon.type === "brand") {
    const C = BRAND_ICONS[icon.value];
    return C ? <C size={size} /> : <div style={{ width: size, height: size, borderRadius: "50%", background: "var(--bg-active)" }} />;
  }
  if (icon.type === "emoji") {
    return <span aria-hidden style={{ fontSize: Math.round(size * 0.72), lineHeight: 1 }}>{icon.value}</span>;
  }
  return <ImageIcon path={icon.value} size={size} />;
}
