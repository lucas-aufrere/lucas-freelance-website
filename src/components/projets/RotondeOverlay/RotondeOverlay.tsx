"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { projects } from "@/data/projects";
import {
  PROJECT_COUNT,
  activeSlotIndex,
  getHasInteracted,
  getOpenSlug,
  getRotation,
  subscribe,
} from "@/components/projets/rotondeStore";
import styles from "./RotondeOverlay.module.scss";

const TOTAL_SLOTS = PROJECT_COUNT.toString().padStart(2, "0");

function getHasInteractedServerSnapshot(): boolean {
  return false;
}

function getOpenSlugServerSnapshot(): string | null {
  return null;
}

export function RotondeOverlay(): React.ReactElement | null {
  const hasInteracted = useSyncExternalStore(
    subscribe,
    getHasInteracted,
    getHasInteractedServerSnapshot,
  );
  // Hide the entire rotonde HUD (index counter, hint, progress dots)
  // as soon as a project is opened — the open project view has its
  // own header (meta + title + counter) on the left, this would
  // otherwise duplicate / leak through.
  const openSlug = useSyncExternalStore(
    subscribe,
    getOpenSlug,
    getOpenSlugServerSnapshot,
  );

  const [activeIdx, setActiveIdx] = useState(0);

  // Poll the rotation ref in rAF so we only re-render when the active slot changes.
  useEffect(() => {
    let raf = 0;
    const tick = (): void => {
      const idx = activeSlotIndex(getRotation());
      setActiveIdx((prev) => (prev === idx ? prev : idx));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, []);

  const activeProject = projects[activeIdx] ?? projects[0];
  const indexLabel = activeProject
    ? `${activeProject.index} / ${TOTAL_SLOTS}`
    : `01 / ${TOTAL_SLOTS}`;

  if (openSlug !== null) return null;

  return (
    <div className={styles.root} aria-hidden="true">
      <p className={styles.index}>{indexLabel}</p>

      <div
        className={styles.hint}
        data-hidden={hasInteracted ? "true" : "false"}
      >
        <span className={styles.hintDot} />
        <span className={styles.hintText}>
          Glissez · Molette · Flèches ← →
        </span>
      </div>

      <ol className={styles.progress} aria-label="Progression">
        {projects.map((p, i) => (
          <li
            key={p.slug}
            className={styles.segment}
            data-active={i === activeIdx ? "true" : "false"}
          />
        ))}
      </ol>
    </div>
  );
}
