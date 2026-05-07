"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { TransitionLink as Link } from "@/components/transitions/TransitionLink";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import styles from "./SelectedProjects.module.scss";

interface Project {
  readonly index: string;
  readonly name: string;
  readonly tags: readonly string[];
  readonly year: string;
  readonly kind: string;
  readonly stack: string;
  readonly href: string;
  readonly image: string;
  readonly alt: string;
}

const projects: readonly Project[] = [
  {
    index: "01",
    name: "Dexnill Productions",
    tags: ["Client", "Studio créatif"],
    year: "2025",
    kind: "Site sur-mesure",
    stack: "Next.js · GSAP · Lenis",
    href: "/projets",
    image: "/projetSlider/dexnill-productions-lucas-aufrere.webp",
    alt: "Aperçu du projet Dexnill Productions",
  },
  {
    index: "02",
    name: "Kengo Kuma",
    tags: ["Étude", "Architecture"],
    year: "2025",
    kind: "Concept éditorial",
    stack: "Next.js · GSAP",
    href: "/projets",
    image: "/projetSlider/kengo-kuma-projet-lucas-aufrere.webp",
    alt: "Aperçu du projet Kengo Kuma",
  },
  {
    index: "03",
    name: "Jacquemus",
    tags: ["Étude", "Mode"],
    year: "2025",
    kind: "Direction front-end",
    stack: "Next.js · GSAP",
    href: "/projets",
    image: "/projetSlider/jacquemus-projet-lucas-aufrere.webp",
    alt: "Aperçu du projet Jacquemus",
  },
  {
    index: "04",
    name: "Fyconic",
    tags: ["Laboratoire", "R&D"],
    year: "2025",
    kind: "Exploration animation",
    stack: "React · GSAP · WebGL-lite",
    href: "/projets",
    image: "/projetSlider/fyconic-projet-lucas-aufrere.webp",
    alt: "Aperçu du projet Fyconic",
  },
  {
    index: "05",
    name: "Poivre Blanc",
    tags: ["Client", "Mode Luxe"],
    year: "2025",
    kind: "Site sur-mesure",
    stack: "Next.js · GSAP",
    href: "/projets",
    image: "/projetSlider/poivreblanc/poivre-blanc.webp",
    alt: "Aperçu du projet Poivre Blanc",
  },
  {
    index: "06",
    name: "BonBon Sauvage",
    tags: ["Client", "Spiritueux"],
    year: "2025",
    kind: "Site sur-mesure",
    stack: "WordPress · Elementor · GSAP",
    href: "/projets",
    image: "/projetSlider/bonbonsauvage/bonbon-hero-1.webp",
    alt: "Aperçu du projet BonBon Sauvage",
  },
];

const COPIES = 3;
const MIDDLE_COPY = Math.floor(COPIES / 2);
const DRAG_THRESHOLD = 6;
const ANIM_DURATION_MS = 650;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function SelectedProjects(): React.ReactElement {
  const sectionRef = useScrollReveal<HTMLElement>({ stagger: 0.08 });
  const reducedMotion = usePrefersReducedMotion();

  const trackRef = useRef<HTMLOListElement | null>(null);
  const periodRef = useRef<number>(0);
  const offsetRef = useRef<number>(0);
  const animFrameRef = useRef<number | null>(null);
  const isDraggingRef = useRef<boolean>(false);
  const movedRef = useRef<number>(0);
  const [, forceRender] = useState(0);

  const loopedProjects = Array.from({ length: COPIES }).flatMap(
    (_, copyIndex) =>
      projects.map((p) => ({ ...p, loopKey: `${copyIndex}-${p.index}` })),
  );

  const measurePeriod = useCallback((): number => {
    const el = trackRef.current;
    if (!el) return 0;
    const items = el.querySelectorAll<HTMLElement>(":scope > li");
    if (items.length < projects.length * 2) return 0;
    const first = items[0];
    const afterFirstCopy = items[projects.length];
    if (!first || !afterFirstCopy) return 0;
    return afterFirstCopy.offsetLeft - first.offsetLeft;
  }, []);

  const wrapOffset = useCallback((value: number): number => {
    const p = periodRef.current;
    if (p <= 0) return value;
    let v = value % p;
    if (v > 0) v -= p;
    return v;
  }, []);

  const applyTransform = useCallback((): void => {
    const el = trackRef.current;
    if (!el) return;
    const p = periodRef.current;
    const base = -p * MIDDLE_COPY;
    el.style.transform = `translate3d(${base + offsetRef.current}px, 0, 0)`;
  }, []);

  const setOffset = useCallback(
    (value: number): void => {
      offsetRef.current = wrapOffset(value);
      applyTransform();
    },
    [wrapOffset, applyTransform],
  );

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;

    const measure = (): void => {
      periodRef.current = measurePeriod();
      offsetRef.current = wrapOffset(offsetRef.current);
      applyTransform();
      forceRender((n) => n + 1);
    };

    measure();

    // Re-measure after images/fonts load.
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measurePeriod, wrapOffset, applyTransform]);

  const cancelAnim = useCallback((): void => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
  }, []);

  const animateTo = useCallback(
    (target: number): void => {
      cancelAnim();
      if (reducedMotion) {
        setOffset(target);
        return;
      }
      const start = offsetRef.current;
      const delta = target - start;
      if (Math.abs(delta) < 0.5) {
        setOffset(target);
        return;
      }
      const startTime = performance.now();
      const tick = (now: number): void => {
        const t = Math.min(1, (now - startTime) / ANIM_DURATION_MS);
        const value = start + delta * easeOutCubic(t);
        setOffset(value);
        if (t < 1) {
          animFrameRef.current = requestAnimationFrame(tick);
        } else {
          animFrameRef.current = null;
        }
      };
      animFrameRef.current = requestAnimationFrame(tick);
    },
    [cancelAnim, reducedMotion, setOffset],
  );

  const stepWidth = useCallback((): number => {
    const el = trackRef.current;
    if (!el) return 0;
    const first = el.querySelector<HTMLElement>(":scope > li");
    if (!first) return 0;
    const gapPx = parseFloat(getComputedStyle(el).columnGap || "0") || 0;
    return first.getBoundingClientRect().width + gapPx;
  }, []);

  const next = useCallback((): void => {
    animateTo(offsetRef.current - stepWidth());
  }, [animateTo, stepWidth]);

  const prev = useCallback((): void => {
    animateTo(offsetRef.current + stepWidth());
  }, [animateTo, stepWidth]);

  // Mouse drag (touch keeps native gesture via pointer events too)
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;

    let startX = 0;
    let startOffset = 0;
    let activePointerId: number | null = null;
    const dragClass = styles.dragging ?? "";

    const onPointerDown = (event: PointerEvent): void => {
      if (event.button !== 0 && event.pointerType === "mouse") return;
      cancelAnim();
      activePointerId = event.pointerId;
      isDraggingRef.current = true;
      startX = event.clientX;
      startOffset = offsetRef.current;
      movedRef.current = 0;
      if (dragClass) el.classList.add(dragClass);
    };

    const onPointerMove = (event: PointerEvent): void => {
      if (!isDraggingRef.current) return;
      if (activePointerId !== null && event.pointerId !== activePointerId) return;
      const dx = event.clientX - startX;
      movedRef.current = Math.max(movedRef.current, Math.abs(dx));
      if (movedRef.current > 2) {
        setOffset(startOffset + dx);
        if (event.cancelable) event.preventDefault();
      }
    };

    const endDrag = (): void => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      activePointerId = null;
      if (dragClass) el.classList.remove(dragClass);
    };

    const onClickCapture = (event: MouseEvent): void => {
      if (movedRef.current > DRAG_THRESHOLD) {
        event.preventDefault();
        event.stopPropagation();
      }
      movedRef.current = 0;
    };

    const onDragStart = (event: DragEvent): void => {
      event.preventDefault();
    };

    el.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    window.addEventListener("blur", endDrag);
    el.addEventListener("click", onClickCapture, true);
    el.addEventListener("dragstart", onDragStart);

    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
      window.removeEventListener("blur", endDrag);
      el.removeEventListener("click", onClickCapture, true);
      el.removeEventListener("dragstart", onDragStart);
    };
  }, [cancelAnim, setOffset]);

  // Wheel scrolling (horizontal mouse wheel or shift+vertical).
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent): void => {
      const horizontal =
        Math.abs(event.deltaX) > Math.abs(event.deltaY) || event.shiftKey;
      if (!horizontal) return;
      event.preventDefault();
      cancelAnim();
      const dx = event.shiftKey ? event.deltaY : event.deltaX;
      setOffset(offsetRef.current - dx);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
    };
  }, [cancelAnim, setOffset]);

  useEffect(() => {
    return () => {
      cancelAnim();
    };
  }, [cancelAnim]);

  return (
    <section
      className={styles.root}
      ref={sectionRef}
      aria-labelledby="projects-title"
    >
      <div className={styles.inner}>
        <header className={styles.header}>
          <p className={styles.index} data-lines>
            03 / 06
          </p>
          <h2 id="projects-title" className={styles.title} data-lines>
            Projets sélectionnés
          </h2>
          <p className={styles.note} data-lines>
            Quatre pièces parlantes — clients et études personnelles
            confondus. Chacune est conçue pour tenir à l&apos;échelle du
            détail typographique comme du rythme de défilement.
          </p>
          <div className={styles.controls} data-reveal>
            <button
              type="button"
              className={styles.arrow}
              aria-label="Projet précédent"
              onClick={prev}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path
                  d="M19 12H5M11 6l-6 6 6 6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="square"
                />
              </svg>
            </button>
            <button
              type="button"
              className={styles.arrow}
              aria-label="Projet suivant"
              onClick={next}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path
                  d="M5 12h14M13 6l6 6-6 6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="square"
                />
              </svg>
            </button>
          </div>
        </header>

        <div className={styles.trackWrap}>
          <ol
            className={styles.track}
            ref={trackRef}
            aria-label="Liste des projets sélectionnés"
          >
            {loopedProjects.map((project) => (
              <li key={project.loopKey} className={styles.slide}>
                <Link
                  href={project.href}
                  className={styles.card}
                  draggable={false}
                >
                  <div className={styles.visual}>
                    <Image
                      src={project.image}
                      alt={project.alt}
                      fill
                      sizes="(max-width: 767px) 85vw, (max-width: 1023px) 55vw, (max-width: 1439px) 40vw, 32vw"
                      className={styles.visualImg}
                      draggable={false}
                    />
                    <span className={styles.visualGlow} aria-hidden="true" />
                  </div>

                  <div className={styles.cardHeader}>
                    <span className={styles.cardIndex}>{project.index}</span>
                    <ul className={styles.cardTags}>
                      {project.tags.map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ul>
                  </div>

                  <h3 className={styles.cardTitle}>{project.name}</h3>

                  <dl className={styles.cardMeta}>
                    <div className={styles.metaRow}>
                      <dt>Type</dt>
                      <dd>{project.kind}</dd>
                    </div>
                    <div className={styles.metaRow}>
                      <dt>Stack</dt>
                      <dd>{project.stack}</dd>
                    </div>
                    <div className={styles.metaRow}>
                      <dt>Année</dt>
                      <dd>/ {project.year}</dd>
                    </div>
                  </dl>
                </Link>
              </li>
            ))}
          </ol>
        </div>

        <footer className={styles.footer} data-reveal>
          <Link href="/projets" className={styles.footerLink}>
            <span>Voir tous les projets</span>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path
                d="M5 12h14M13 6l6 6-6 6"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="square"
              />
            </svg>
          </Link>
        </footer>
      </div>
    </section>
  );
}
