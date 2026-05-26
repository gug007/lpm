import { useEffect } from "react";
import { SaveWindowSize } from "../../wailsjs/go/main/App";
import { WindowGetSize } from "../../wailsjs/runtime/runtime";

const DEBOUNCE_MS = 500;

export function useWindowResizeSaver() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        WindowGetSize().then(({ w, h }) => SaveWindowSize(w, h));
      }, DEBOUNCE_MS);
    };
    window.addEventListener("resize", onResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", onResize);
    };
  }, []);
}
