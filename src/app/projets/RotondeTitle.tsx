"use client";

import { useSyncExternalStore } from "react";
import {
  getOpenSlug,
  subscribe,
} from "@/components/projets/rotondeStore";
import styles from "./page.module.scss";

function getOpenSlugServerSnapshot(): string | null {
  return null;
}

// "Projets sélectionnés" label rendered above the rotonde. Kept in the
// DOM at all times (SSR + client) for SEO + the section's
// aria-labelledby reference, but hidden visually as soon as a project
// is opened so it doesn't bleed through the open project view.
export function RotondeTitle(): React.ReactElement {
  const openSlug = useSyncExternalStore(
    subscribe,
    getOpenSlug,
    getOpenSlugServerSnapshot,
  );

  return (
    <h2
      id="projets-rotonde-title"
      className={styles.rotondeTitle}
      data-hidden={openSlug !== null ? "true" : undefined}
    >
      Projets sélectionnés
    </h2>
  );
}
