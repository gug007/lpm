interface TrafficLightsProps {
  size?: "sm" | "md";
}

const SIZE_CLASS: Record<NonNullable<TrafficLightsProps["size"]>, string> = {
  sm: "h-1.5 w-1.5",
  md: "h-2 w-2",
};

export function TrafficLights({ size = "md" }: TrafficLightsProps) {
  const dot = `${SIZE_CLASS[size]} rounded-full`;
  return (
    <>
      <span className={`${dot} bg-[#ff5f57]`} />
      <span className={`${dot} bg-[#febc2e]`} />
      <span className={`${dot} bg-[#28c840]`} />
    </>
  );
}
