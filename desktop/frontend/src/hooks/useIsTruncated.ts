import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export function useIsTruncated(text: string) {
  const ref = useRef<HTMLSpanElement>(null);
  const [truncated, setTruncated] = useState(false);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setTruncated(el.scrollWidth > el.clientWidth);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure]);

  useLayoutEffect(() => {
    measure();
  }, [text, measure]);

  return { ref, truncated };
}
