import { useEffect, useState } from "react";

// macOS fullscreen hides the title bar and menu bar, so the webview fills
// the entire screen. In windowed mode the title bar always reserves space,
// so matching both dimensions exactly is a reliable signal.
function detect(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.innerHeight === window.screen.height &&
    window.innerWidth === window.screen.width
  );
}

export function useIsFullscreen(): boolean {
  const [isFullscreen, setIsFullscreen] = useState(detect);
  useEffect(() => {
    const check = () => setIsFullscreen(detect());
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return isFullscreen;
}
