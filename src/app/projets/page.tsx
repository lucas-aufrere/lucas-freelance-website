import type { Metadata } from "next";
import { RotondeCanvas } from "@/components/projets/RotondeCanvas/RotondeCanvas";
import { ProjectsFallback } from "@/components/projets/ProjectsFallback/ProjectsFallback";
import { RotondeTitle } from "./RotondeTitle";
import { buildPageMetadata } from "@/lib/metadata";
import {
  projectsBreadcrumbSchema,
  projectsCollectionSchema,
  stringifyJsonLd,
} from "@/lib/structured-data";
import styles from "./page.module.scss";

export const metadata: Metadata = buildPageMetadata({
  title: "Projets — Développeur front-end créatif",
  description:
    "Sélection de projets web sur-mesure : sites éditoriaux, animations GSAP, expériences 3D. Clients et études personnelles par Lucas Aufrère.",
  path: "/projets",
});

export default function ProjetsPage(): React.ReactElement {
  return (
    <>
      {/* H1 invisible mais bien présent dans le DOM pour les crawlers,
          la rotonde 3D ne pouvant en porter aucun (tout est rendu
          dans le canvas WebGL). */}
      <h1 className={styles.srOnly}>Projets de Lucas Aufrère</h1>

      <section
        className={styles.rotondeSection}
        aria-labelledby="projets-rotonde-title"
      >
        <RotondeTitle />
        <RotondeCanvas />
      </section>

      <ProjectsFallback />

      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: stringifyJsonLd(projectsCollectionSchema()),
        }}
      />
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: stringifyJsonLd(projectsBreadcrumbSchema()),
        }}
      />
    </>
  );
}
