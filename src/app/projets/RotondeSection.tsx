"use client";

import { RotondeCanvas } from "@/components/projets/RotondeCanvas/RotondeCanvas";
import { RotondeTitle } from "./RotondeTitle";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import styles from "./page.module.scss";

// Hides the entire WebGL rotonde when the visitor has reduced-motion
// enabled. The ProjectsFallback below already mirrors the rotonde as
// crawlable, scroll-friendly HTML, so removing the canvas leaves a
// fully usable, fully accessible page.
export function RotondeSection(): React.ReactElement | null {
  const prefersReducedMotion = usePrefersReducedMotion();

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
