import { useEffect, useState } from "react";
import { listMonospaceFonts } from "../components/terminal/fontDetect";

export function useMonospaceFonts(): string[] {
  const [fonts, setFonts] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    void listMonospaceFonts().then((f) => {
      if (alive) setFonts(f);
    });
    return () => {
      alive = false;
    };
  }, []);
  return fonts;
}
