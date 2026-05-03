"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "@/lib/gsap";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { findProjectBySlug } from "@/data/projects";
import {
  closeProject,
  getFocusProgress,
  getOpenSlug,
  setProjectScroll,
  subscribe,
} from "@/components/projets/rotondeStore";
import styles from "./ProjectOverlay.module.scss";

const REVEAL_THRESHOLD = 0.95;

function getOpenSlugServerSnapshot(): string | null {
  return null;
}

// WeakMap caches the inner spans per element so GSAP can re-animate the
// same lines after a close/reopen cycle without re-splitting the DOM.
const splitCache = new WeakMap<HTMLElement, HTMLElement[]>();

function splitTextIntoLines(el: HTMLElement): HTMLElement[] {
  const cached = splitCache.get(el);
  if (cached) return cached;

  const original = el.textContent ?? "";
  if (!original.trim()) return [];

  const tokens = original.split(/(\s+)/);
  el.textContent = "";
  const wordSpans: HTMLSpanElement[] = [];
  for (const tok of tokens) {
    if (!tok) continue;
    if (/^\s+$/.test(tok)) {
      el.appendChild(document.createTextNode(tok));
    } else {
      const span = document.createElement("span");
      span.textContent = tok;
      span.style.display = "inline-block";
      el.appendChild(span);
      wordSpans.push(span);
    }
  }

  interface Line {
    readonly top: number;
    readonly words: HTMLSpanElement[];
  }
  const lines: Line[] = [];
  for (const span of wordSpans) {
    const top = span.offsetTop;
    const last = lines.at(-1);
    if (last && Math.abs(last.top - top) < 2) {
      last.words.push(span);
    } else {
      lines.push({ top, words: [span] });
    }
  }

  el.textContent = "";
  const inners: HTMLElement[] = [];
  for (const line of lines) {
    const wrap = document.createElement("span");
    wrap.style.display = "block";
    wrap.style.overflow = "hidden";
    wrap.style.paddingBottom = "0.08em";
    wrap.style.marginBottom = "-0.08em";
    // Horizontal slack so the last glyph's ink overhang on a line
    // (common with -graph descenders, italic slants, narrow viewports
    // where the last word lands near the right edge) doesn't get
    // shaved by the mask. Compensated by negative margin so the
    // wrap's effective box stays the same.
    wrap.style.paddingRight = "0.12em";
    wrap.style.marginRight = "-0.12em";

    const inner = document.createElement("span");
    inner.style.display = "block";
    inner.style.willChange = "transform";
    inner.textContent = line.words.map((w) => w.textContent).join(" ");

    wrap.appendChild(inner);
    el.appendChild(wrap);
    inners.push(inner);
  }

  splitCache.set(el, inners);
  return inners;
}

type AnimatedTextTag = "h2" | "p";

interface AnimatedTextProps {
  readonly text: string;
  readonly className?: string;
  readonly as?: AnimatedTextTag;
  readonly id?: string;
  // active=false holds the lines hidden (yPercent: 110); active=true
  // plays them in. Toggling false→true after a true→false cycle plays
  // the close-out animation. Used so we can sync per-slide split-line
  // reveals with the parent overlay's reveal/close timing rather than
  // animating prematurely behind the still-hidden .content wrapper.
  readonly active: boolean;
}

// Generic split-line mask reveal. Each line lives in an overflow-hidden
// wrap, the inner span animates yPercent 110 → 0 on enter, 0 → 110 on
// exit. Re-mounting the component (via key={text}) is the standard way
// to play a fresh enter on slide change — the splitTextIntoLines
// WeakMap cache is keyed by element so a fresh element gets a fresh
// split.
function AnimatedText({
  text,
  className,
  as = "p",
  id,
  active,
}: AnimatedTextProps): React.ReactElement {
  const ref = useRef<HTMLElement | null>(null);
  const hasRevealedRef = useRef(false);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      const inners = splitTextIntoLines(el);
      if (inners.length === 0) return;

      if (active) {
        gsap.set(inners, { yPercent: 110 });
        hasRevealedRef.current = true;
        gsap.to(inners, {
          yPercent: 0,
          duration: 0.55,
          ease: "expo.out",
          stagger: 0.04,
        });
      } else if (hasRevealedRef.current) {
        gsap.to(inners, {
          yPercent: 110,
          duration: 0.4,
          ease: "expo.in",
          stagger: 0.02,
          onComplete: () => {
            hasRevealedRef.current = false;
          },
        });
      } else {
        gsap.set(inners, { yPercent: 110 });
      }
    },
    { dependencies: [active] },
  );

  if (as === "h2") {
    return (
      <h2
        ref={ref as React.RefObject<HTMLHeadingElement>}
        className={className}
        id={id}
      >
        {text}
      </h2>
    );
  }
  return (
    <p
      ref={ref as React.RefObject<HTMLParagraphElement>}
      className={className}
      id={id}
    >
      {text}
    </p>
  );
}

export function ProjectOverlay(): React.ReactElement | null {
  const storeSlug = useSyncExternalStore(
    subscribe,
    getOpenSlug,
    getOpenSlugServerSnapshot,
  );
  const reducedMotion = usePrefersReducedMotion();

  const [renderedSlug, setRenderedSlug] = useState<string | null>(null);
  const [textStage, setTextStage] = useState<"hidden" | "revealed">("hidden");
  // Index of the gallery image currently centered in the viewport — used
  // to swap the caption text in the left column. Driven by the scroll
  // listener below.
  const [currentIndex, setCurrentIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const galleryRef = useRef<HTMLDivElement | null>(null);
  // Tracks whether the reveal has fired at least once for the current
  // renderedSlug — lets us distinguish "initial mount" (must stay hidden,
  // no animation, no flash) from "real close" (play the reverse).
  const hasRevealedRef = useRef(false);

  // Derived sync — adopt new slug as soon as the store opens one.
  if (storeSlug !== null && storeSlug !== renderedSlug) {
    setRenderedSlug(storeSlug);
  }
  // Reduced-motion short-circuit: when closed in this mode, drop rendered slug.
  if (reducedMotion && storeSlug === null && renderedSlug !== null) {
    setRenderedSlug(null);
  }

  // Immediately start the text reverse when the store closes — derived
  // state during render (React 19 allows this, useEffect setState would
  // trigger `react-hooks/set-state-in-effect`).
  if (storeSlug === null && textStage === "revealed") {
    setTextStage("hidden");
  }

  // Poll focusProgress (non-reactive) to:
  //   (a) mirror it onto a CSS custom property for the backdrop opacity
  //   (b) flip textStage to "revealed" once the camera has settled
  //   (c) unmount the overlay once the reverse dolly has finished
  useEffect(() => {
    if (!renderedSlug) return;
    let raf = 0;
    const tick = (): void => {
      const p = getFocusProgress();
      const root = rootRef.current;
      if (root) {
        root.style.setProperty("--focus-progress", p.toFixed(3));
      }
      if (
        p >= REVEAL_THRESHOLD &&
        textStage === "hidden" &&
        storeSlug !== null
      ) {
        setTextStage("revealed");
      }
      if (storeSlug === null && p < 0.001) {
        setRenderedSlug(null);
        setTextStage("hidden");
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [renderedSlug, textStage, storeSlug]);

  // Text GSAP reveal / reverse — triggered by textStage changes.
  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root || !renderedSlug) return;
      const content = root.querySelector<HTMLElement>(`.${styles.content}`);
      const texts = Array.from(
        root.querySelectorAll<HTMLElement>("[data-lines]"),
      );
      if (texts.length === 0) return;

      if (reducedMotion) {
        if (content) content.style.opacity = "1";
        return;
      }

      const inners: HTMLElement[] = [];
      for (const t of texts) {
        const parts = splitTextIntoLines(t);
        inners.push(...parts);
      }
      if (inners.length === 0) return;

      if (textStage === "revealed") {
        // Camera has settled — prep hidden state and play the reveal.
        // The .content wrapper is kept at opacity 0 until this moment, which
        // guarantees no raw text flash before the masks are in place.
        gsap.set(inners, { yPercent: 110 });
        if (content) gsap.set(content, { opacity: 1 });
        hasRevealedRef.current = true;
        gsap.to(inners, {
          yPercent: 0,
          duration: 0.75,
          ease: "expo.out",
          stagger: 0.05,
        });
      } else if (hasRevealedRef.current) {
        // Real close — play the reverse masks then fade the wrapper back out.
        gsap.to(inners, {
          yPercent: 110,
          duration: 0.4,
          ease: "expo.in",
          stagger: 0.02,
          onComplete: () => {
            if (content) gsap.set(content, { opacity: 0 });
            hasRevealedRef.current = false;
          },
        });
      } else {
        // Initial mount: keep everything hidden, no animation — the reveal
        // stage will fire once focusProgress crosses REVEAL_THRESHOLD.
        gsap.set(inners, { yPercent: 110 });
        if (content) gsap.set(content, { opacity: 0 });
      }
    },
    { scope: rootRef, dependencies: [textStage, renderedSlug, reducedMotion] },
  );

  // Focus the close button once the reveal is complete
  useEffect(() => {
    if (renderedSlug && textStage === "revealed") {
      closeBtnRef.current?.focus();
    }
  }, [renderedSlug, textStage]);

  const handleClose = useCallback(() => {
    // Snap both the overlay scroll AND the store-mirrored scroll value
    // back to 0 before closing. The 3D plane reads getProjectScroll()
    // each frame to translate its Y, so resetting it ensures the plane
    // is back in its original spot when the reverse dolly plays.
    const root = rootRef.current;
    if (root) root.scrollTop = 0;
    setProjectScroll(0);
    closeProject();
  }, []);

  // Mirror the overlay's own scroll position into the store so the 3D
  // plane translates upward in lockstep with the HTML gallery, AND
  // derive which gallery image is currently centered in the viewport so
  // the left column caption can swap to its description.
  useEffect(() => {
    if (!renderedSlug) return;
    const root = rootRef.current;
    if (!root) return;
    const project = findProjectBySlug(renderedSlug);
    const galleryLen = project?.gallery?.length ?? 1;

    const onScroll = (): void => {
      const top = root.scrollTop;
      setProjectScroll(top);
      const vh = window.innerHeight || 1;
      // Image whose center is closest to the viewport center. The first
      // 100vh of column is the spacer (= image 0 / the 3D plane), so
      // that's where the math starts.
      const idx = Math.floor((top + vh / 2) / vh);
      const clamped = Math.max(0, Math.min(galleryLen - 1, idx));
      setCurrentIndex((prev) => (prev === clamped ? prev : clamped));
    };
    root.addEventListener("scroll", onScroll, { passive: true });
    // Push initial value in case the user re-opens with stale scroll.
    setProjectScroll(root.scrollTop);
    setCurrentIndex(0);
    return () => {
      root.removeEventListener("scroll", onScroll);
    };
  }, [renderedSlug]);

  // Escape key
  useEffect(() => {
    if (!renderedSlug || storeSlug === null) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [renderedSlug, storeSlug, handleClose]);


  if (!renderedSlug) return null;
  const project = findProjectBySlug(renderedSlug);
  if (!project) return null;

  // Gallery — defaults to the single main image when no extra frames are
  // provided. The first item always equals project.image so the HTML
  // surface visually replaces the WebGL plane underneath without a swap.
  const gallery =
    project.gallery ??
    [{ src: project.image, caption: project.description }];

  // Per-slide text: slide 0 always shows the project header (name + role
  // + description-as-caption). Slides 1+ override title / subtitle with
  // their own short story; if a slide doesn't define them, fall back to
  // project-level values so the layout never feels "missing".
  const isFirstSlide = currentIndex === 0;
  const slide = gallery[currentIndex] ?? gallery[0];
  const displayTitle = isFirstSlide
    ? project.name
    : (slide?.title ?? project.name);
  const displayRole = isFirstSlide
    ? project.role
    : (slide?.subtitle ?? null);
  const displayCaption = slide?.caption ?? project.description;
  const isRevealed = textStage === "revealed";

  return (
    <div
      ref={rootRef}
      className={styles.root}
      role="dialog"
      aria-modal="true"
      aria-labelledby="project-overlay-title"
      data-lenis-prevent
    >
      {/*
        Backdrop and close button stay fixed in the viewport (position:
        fixed) so they don't scroll with the gallery — the user always
        sees the gradient on the left and the close button top-right.
      */}
      <div className={styles.backdrop} aria-hidden="true" />

      <button
        ref={closeBtnRef}
        type="button"
        className={styles.close}
        aria-label="Fermer la fiche projet"
        onClick={handleClose}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path
            d="M6 6l12 12M18 6l-12 12"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="square"
            fill="none"
          />
        </svg>
      </button>

      {/*
        Left column: the text is sticky inside its column so it stays
        centered in the viewport while the gallery on the right scrolls
        past. Same content structure as before — only the wrapper is new.
      */}
      <div className={styles.contentColumn}>
        <div className={styles.content}>
          <p className={styles.meta} data-lines>
            {project.index} · {project.year}
          </p>
          {/*
            Title / subtitle / caption all swap with the active slide
            via key remount. AnimatedText holds them hidden until the
            overlay's textStage flips to "revealed" so the per-slide
            split-line animations don't burn behind the still-fading
            .content wrapper at first open.
          */}
          <AnimatedText
            key={`title-${renderedSlug}-${displayTitle}`}
            text={displayTitle}
            className={styles.title}
            as="h2"
            id="project-overlay-title"
            active={isRevealed}
          />
          {displayRole ? (
            <AnimatedText
              key={`role-${renderedSlug}-${displayRole}`}
              text={displayRole}
              className={styles.role}
              active={isRevealed}
            />
          ) : null}
          <AnimatedText
            key={`caption-${renderedSlug}-${currentIndex}`}
            text={displayCaption}
            className={styles.description}
            active={isRevealed}
          />
          <p className={styles.galleryCounter}>
            {String(currentIndex + 1).padStart(2, "0")}
            {" / "}
            {String(gallery.length).padStart(2, "0")}
          </p>
          {/* Mobile-only hint that the panel below is a scrollable
              slider. Hidden via CSS at tablet-up. */}
          <p className={styles.scrollHint} aria-hidden="true">
            Scroll to explore
          </p>
          <dl className={styles.specs}>
            <div className={styles.specRow}>
              <dt data-lines>Type</dt>
              <dd data-lines>{project.kind}</dd>
            </div>
            <div className={styles.specRow}>
              <dt data-lines>Stack</dt>
              <dd data-lines>{project.stack}</dd>
            </div>
            <div className={styles.specRow}>
              <dt data-lines>Tags</dt>
              <dd data-lines>{project.tags.join(" · ")}</dd>
            </div>
          </dl>
        </div>
      </div>

      {/*
        Right column: pure scroll runway. One transparent 100dvh slot
        per gallery image, no HTML rendering. The visual is entirely
        carried by the WebGL <FocusedGallery /> in RotondeScene, which
        reads getProjectScroll() each frame and translates its slider
        group horizontally. The HTML side just provides scrollable
        height so the user has something to drive.
      */}
      <div
        ref={galleryRef}
        className={styles.gallery}
        aria-hidden="true"
      >
        {gallery.map((entry, i) => (
          <div key={`${entry.src}-${i}`} className={styles.scrollSlot} />
        ))}
      </div>
    </div>
  );
}
