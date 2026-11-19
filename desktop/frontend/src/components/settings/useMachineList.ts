import { useEffect, useState } from "react";

// A list a machine reports, such as its fonts or sounds: empty until it answers,
// when it can't, or when there is nothing to ask (`load` null).
export function useMachineList<T = string>(load: (() => Promise<T[]>) | null): T[] {
  const [items, setItems] = useState<T[]>([]);
  useEffect(() => {
    if (!load) return;
    let alive = true;
    load()
      .then((list) => {
        if (alive) setItems(list);
      })
      .catch(() => {
        if (alive) setItems([]);
      });
    return () => {
      alive = false;
    };
  }, [load]);
  return items;
}
