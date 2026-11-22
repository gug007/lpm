"use client";

import { useEffect } from "react";

type Props = { to: string };

// A shared feature link exists for its preview card; a person opening it
// belongs on the feature itself, in place among the rest.
export default function FeatureRedirect({ to }: Props) {
  useEffect(() => {
    window.location.replace(to);
  }, [to]);
  return null;
}
