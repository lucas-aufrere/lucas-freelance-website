"use client";

import { useEffect, useRef } from "react";
import { RotondeCanvas } from "@/components/projets/RotondeCanvas/RotondeCanvas";
import { RotondeTitle } from "./RotondeTitle";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { register as registerTransitionHold } from "@/lib/transitionGate";
import styles from "./page.module.scss";

// Hides the entire WebGL rotonde when the visitor has reduced-motion
// enabled. The ProjectsFallback below already mirrors the rotonde as
// crawlable, scroll-friendly HTML, so removing the canvas leaves a
// fully usable, fully accessible page.
//
// In normal-motion mode we register a transition hold the moment this
// section mounts: the page-transition curtain stays up until the
// canvas signals it has painted its first frame (see RotondeScene's
// AssetReadyEmitter). This stops the rotonde from "popping" in late
// after the curtain has already lifted.
export function RotondeSection(): React.ReactElement | null {
  const prefersReducedMotion = usePrefersReducedMotion();
  const releaseRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (prefersReducedMotion) return;
    releaseRef.current = registerTransitionHold();
    return () => {
      // Safety net: drain the hold on unmount so a future navigation
      // can never block on a stale registration (texture load failure,
      // dev HMR, fast back-button, etc.).
      releaseRef.current?.();
      releaseRef.current = null;
    };
  }, [prefersReducedMotion]);

  if (prefersReducedMotion) {
    return null;
  }

  return (
    <section
      className={styles.rotondeSection}
      aria-labelledby="projets-rotonde-title"
    >
      <RotondeTitle />
      <RotondeCanvas />
    </section>
  );
}
