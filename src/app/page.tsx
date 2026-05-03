import type { Metadata } from "next";
import { Hero } from "@/components/home/Hero/Hero";
import { Philosophy } from "@/components/home/Philosophy/Philosophy";
import { Approche } from "@/components/home/Approche/Approche";
import { SelectedProjects } from "@/components/home/SelectedProjects/SelectedProjects";
import { Services } from "@/components/home/Services/Services";
import { Collaborations } from "@/components/home/Collaborations/Collaborations";
import { buildPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildPageMetadata({
  title: "Lucas Aufrère — Développeur front-end créatif freelance",
  description:
    "Sites sur-mesure, animations fluides, interfaces soignées. Basé à Clermont-Ferrand, missions partout en France et à l'international.",
  path: "/",
});

export default function HomePage(): React.ReactElement {
  return (
    <>
      {/* The hero portrait is composed of CSS background-image tiles, so
          the browser only discovers /lucas-hero_comp.webp after CSSOM
          parses. Preloading from the server-rendered <head> lets the
          fetch start in parallel with HTML. The portrait is display:none
          below 768px, so the media query keeps mobile clients from
          downloading an asset they would never paint. */}
      <link
        rel="preload"
        as="image"
        href="/lucas-hero_comp.webp"
        type="image/webp"
        fetchPriority="high"
        media="(min-width: 768px)"
      />
      <Hero />
      <Philosophy />
      <Approche />
      <SelectedProjects />
      <Services />
      <Collaborations />
    </>
  );
}
