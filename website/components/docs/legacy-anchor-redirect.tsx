"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { docsPathForLegacyId } from "@/lib/docs-pages";

// /config was one long page, so old links carry a section in the hash
// (/config#zones, older desktop builds' /config#global-config). The redirect to
// /docs keeps the hash, and this sends it on to the page that section became.
export function LegacyAnchorRedirect() {
  const router = useRouter();

  useEffect(() => {
    const target = docsPathForLegacyId(window.location.hash.slice(1));
    if (target) router.replace(target);
  }, [router]);

  return null;
}
