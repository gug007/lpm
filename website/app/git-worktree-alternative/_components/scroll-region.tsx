"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export default function ScrollRegion({
  label,
  className,
  children,
}: {
  label: string;
  className: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrollable, setScrollable] = useState(true);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(() =>
      setScrollable(element.scrollWidth > element.clientWidth),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      role={scrollable ? "region" : undefined}
      aria-label={scrollable ? label : undefined}
      tabIndex={scrollable ? 0 : undefined}
      className={className}
    >
      {children}
    </div>
  );
}
