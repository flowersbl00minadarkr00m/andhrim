"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const TopologyField = dynamic(
  () => import("@designcodeio/threeui/components/ConstellationField")
    .then(({ ConstellationField }) => ConstellationField),
  { ssr: false },
);

type AtmospherePreferences = {
  compact: boolean;
  motionAllowed: boolean;
};

const initialPreferences: AtmospherePreferences = {
  compact: false,
  motionAllowed: false,
};

export function VisualAtmosphere() {
  const pathname = usePathname();
  const [preferences, setPreferences] = useState(initialPreferences);
  const staticOnly = pathname === "/evaluation" || pathname.startsWith("/evaluation/");

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const compactViewport = window.matchMedia("(max-width: 700px)");

    const syncPreferences = () => {
      setPreferences({
        compact: compactViewport.matches,
        motionAllowed: !reducedMotion.matches,
      });
    };

    syncPreferences();
    reducedMotion.addEventListener("change", syncPreferences);
    compactViewport.addEventListener("change", syncPreferences);

    return () => {
      reducedMotion.removeEventListener("change", syncPreferences);
      compactViewport.removeEventListener("change", syncPreferences);
    };
  }, []);

  return (
    <div className="visual-atmosphere" aria-hidden="true">
      <div className="visual-atmosphere__static" />
      {!staticOnly && preferences.motionAllowed ? (
        <TopologyField
          className="visual-atmosphere__field"
          variant="topo-field"
          mode="dark"
          speed={preferences.compact ? 0.12 : 0.2}
          length={preferences.compact ? 0.72 : 0.9}
          density={preferences.compact ? 0.5 : 0.72}
          opacity={preferences.compact ? 0.32 : 0.42}
          style={{
            width: "116%",
            height: "116%",
            filter: "brightness(.62) sepia(1) saturate(8) hue-rotate(178deg)",
          }}
        />
      ) : null}
    </div>
  );
}
