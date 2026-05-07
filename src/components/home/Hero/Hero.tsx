"use client";

import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { TransitionLink as Link } from "@/components/transitions/TransitionLink";
import { useTransition } from "@/components/transitions/TransitionProvider";
import { useGSAP } from "@gsap/react";
import { gsap } from "@/lib/gsap";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import styles from "./Hero.module.scss";

const TILE_COLS = 6;
const TILE_ROWS = 10;

interface Line {
  readonly top: number;
  readonly words: HTMLSpanElement[];
}

// Split a single text node into per-character spans inside overflow-hidden
// masks. Each inner span is the animation target (slides in horizontally).
function splitTextIntoChars(el: HTMLElement): HTMLElement[] {
  const original = el.textContent ?? "";
  if (!original) return [];
  el.textContent = "";
  const inners: HTMLElement[] = [];
  for (const ch of original) {
    const wrap = document.createElement("span");
    wrap.style.display = "inline-block";
    // Clip only on X so the letter is masked as it slides in from the left,
    // while leaving vertical slack for the font's full glyph box — a tight
    // line-height on a large display font otherwise shaves the tops of
    // uppercase letters (L, A, F) when they render inside overflow:hidden.
    wrap.style.overflowX = "clip";
    wrap.style.overflowY = "visible";
    wrap.style.verticalAlign = "baseline";
    wrap.style.paddingTop = "0.18em";
    wrap.style.marginTop = "-0.18em";
    wrap.style.paddingBottom = "0.22em";
    wrap.style.marginBottom = "-0.22em";
    // Extra horizontal slack for letters whose ink overhangs their advance
    // width (S, A, W…) — without this the display font's tight side-bearings
    // let the mask's right edge shave the glyph.
    wrap.style.paddingLeft = "0.04em";
    wrap.style.marginLeft = "-0.04em";
    wrap.style.paddingRight = "0.08em";
    wrap.style.marginRight = "-0.08em";

    const inner = document.createElement("span");
    inner.style.display = "inline-block";
    inner.style.willChange = "transform";
    inner.textContent = ch === " " ? " " : ch;

    wrap.appendChild(inner);
    el.appendChild(wrap);
    inners.push(inner);
  }
  return inners;
}

function splitTextIntoLines(el: HTMLElement): HTMLElement[] {
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

    const inner = document.createElement("span");
    inner.style.display = "block";
    inner.style.willChange = "transform";
    inner.textContent = line.words.map((w) => w.textContent).join(" ");

    wrap.appendChild(inner);
    el.appendChild(wrap);
    inners.push(inner);
  }
  return inners;
}

export function Hero(): React.ReactElement {
  const rootRef = useRef<HTMLElement | null>(null);
  const portraitRef = useRef<HTMLDivElement | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  // Gate the intro timeline on the curtain being gone. When the user
  // lands on the home page via a page transition, the Hero mounts while
  // the curtain is still covering — without this, the staggered tile
  // reveal + title char slide play under the curtain and the user sees
  // them already settled by the time it lifts.
  const { isReady } = useTransition();

  // Pre-compute the tile grid once — stable across renders so GSAP selectors
  // don't re-attach.
  const tiles = useMemo(() => {
    const out: { col: number; row: number }[] = [];
    for (let r = 0; r < TILE_ROWS; r += 1) {
      for (let c = 0; c < TILE_COLS; c += 1) {
        out.push({ col: c, row: r });
      }
    }
    return out;
  }, []);

  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root) return;

      const titleTargets = Array.from(
        root.querySelectorAll<HTMLElement>("[data-chars]"),
      );
      const lineTargets = Array.from(
        root.querySelectorAll<HTMLElement>("[data-lines]"),
      );
      const fadeTargets = Array.from(
        root.querySelectorAll<HTMLElement>("[data-reveal]"),
      );
      const tileTargets = Array.from(
        root.querySelectorAll<HTMLElement>("[data-tile]"),
      );

      const charInners: HTMLElement[] = [];
      for (const el of titleTargets) {
        charInners.push(...splitTextIntoChars(el));
      }
      const lineInners: HTMLElement[] = [];
      for (const el of lineTargets) {
        lineInners.push(...splitTextIntoLines(el));
      }

      if (reducedMotion) {
        gsap.set([...charInners, ...lineInners], { clearProps: "transform" });
        if (fadeTargets.length > 0) {
          gsap.set(fadeTargets, { opacity: 1, y: 0 });
        }
        if (tileTargets.length > 0) {
          gsap.set(tileTargets, { opacity: 1, y: 0, scale: 1 });
        }
        // Reduced-motion path skips the timeline entirely. Drop the
        // pre-hide attribute so the CSS rules stop applying — without
        // this the hero would stay visually empty for users on the
        // reduced-motion preference.
        root.removeAttribute("data-hero-pending");
        return;
      }

      if (charInners.length > 0) {
        gsap.set(charInners, { xPercent: -110 });
      }
      if (lineInners.length > 0) {
        gsap.set(lineInners, { yPercent: 110 });
      }
      if (fadeTargets.length > 0) {
        gsap.set(fadeTargets, { opacity: 0, y: 16 });
      }
      if (tileTargets.length > 0) {
        gsap.set(tileTargets, { opacity: 0, y: 18, scale: 0.88 });
      }

      // Inline gsap.set states now match the SSR-painted CSS pre-hide
      // exactly — flip the attribute off so the CSS rules stop applying
      // and the timeline can drive everything from inline styles alone.
      root.removeAttribute("data-hero-pending");

      // Curtain still up — keep the initial hidden state and hold off
      // the timeline. The hook re-runs once isReady flips to true.
      if (!isReady) {
        return;
      }

      const tl = gsap.timeline({ defaults: { ease: "expo.out" } });

      if (tileTargets.length > 0) {
        tl.to(
          tileTargets,
          {
            opacity: 1,
            y: 0,
            scale: 1,
            duration: 0.5,
            ease: "power3.out",
            // clearProps lets the CSS `:hover` transform take over afterwards
            // — otherwise gsap's trailing inline `transform: ...` wins over
            // the stylesheet and the hover lift does nothing.
            clearProps: "transform",
            stagger: {
              amount: 0.45,
              from: "random",
              grid: [TILE_ROWS, TILE_COLS],
            },
          },
          0,
        );
      }

      if (charInners.length > 0) {
        tl.to(
          charInners,
          {
            xPercent: 0,
            duration: 0.9,
            stagger: 0.035,
          },
          0.25,
        );
      }

      if (lineInners.length > 0) {
        tl.to(
          lineInners,
          {
            yPercent: 0,
            duration: 0.75,
            stagger: 0.06,
          },
          0.4,
        );
      }

      if (fadeTargets.length > 0) {
        tl.to(
          fadeTargets,
          {
            opacity: 1,
            y: 0,
            duration: 0.55,
            ease: "power2.out",
            stagger: 0.06,
          },
          0.55,
        );
      }

      return () => {
        tl.kill();
      };
    },
    { scope: rootRef, dependencies: [reducedMotion, isReady] },
  );

  // Cursor-proximity lift — only tiles within a radius of the pointer rise
  // in Z (perspective depth). Targets are smoothed per-frame so the lift
  // fades in/out gracefully rather than snapping.
  useEffect(() => {
    if (reducedMotion) return;
    const portrait = portraitRef.current;
    if (!portrait) return;

    const tileEls = Array.from(
      portrait.querySelectorAll<HTMLElement>("[data-tile]"),
    );
    if (tileEls.length === 0) return;

    const LIFT_MAX = 70; // px of translateZ at the cursor's exact position
    const SCALE_MIN = 0.84; // tile scale at max lift — shrinks as it rises
    // Match the resting-state overscale defined in CSS — keeps the
    // 0.5% overlap that hides sub-pixel seams between adjacent tiles
    // throughout the cursor interaction (without it, JS-driven
    // transform would override the CSS scale and the seams would
    // pop back as soon as the user moved the cursor).
    const BASE_SCALE = 1.005;
    const RADIUS_FRACTION = 0.35; // falloff radius, relative to portrait size
    const SMOOTH = 0.18; // per-frame lerp coefficient
    const ACTIVE_THRESHOLD = 0.05; // stop the loop once everything settles

    let rectW = 1;
    let rectH = 1;
    const tileCenters: { x: number; y: number }[] = [];
    const current = new Float32Array(tileEls.length);
    const targetLift = new Float32Array(tileEls.length);

    const measure = (): void => {
      const r = portrait.getBoundingClientRect();
      rectW = r.width;
      rectH = r.height;
      tileCenters.length = 0;
      for (const el of tileEls) {
        const tr = el.getBoundingClientRect();
        tileCenters.push({
          x: tr.left + tr.width / 2 - r.left,
          y: tr.top + tr.height / 2 - r.top,
        });
      }
    };

    measure();
    const resizeObs = new ResizeObserver(() => {
      measure();
    });
    resizeObs.observe(portrait);

    let pointerX = -9999;
    let pointerY = -9999;
    let pointerInside = false;
    let raf = 0;

    const tick = (): void => {
      const radius = Math.min(rectW, rectH) * RADIUS_FRACTION;
      const radius2 = radius * radius;
      let anyActive = false;

      for (let i = 0; i < tileEls.length; i += 1) {
        const c = tileCenters[i];
        if (!c) continue;
        let t = 0;
        if (pointerInside) {
          const dx = pointerX - c.x;
          const dy = pointerY - c.y;
          const d2 = dx * dx + dy * dy;
          // Quadratic falloff — closer tiles get more lift, clamped at 0
          // beyond the radius so far-away tiles stay flat.
          const f = Math.max(0, 1 - d2 / radius2);
          t = f * f;
        }
        targetLift[i] = t;
        const prev = current[i] ?? 0;
        const next = prev + (t - prev) * SMOOTH;
        current[i] = next;
        if (Math.abs(next - t) > 0.001 || next > ACTIVE_THRESHOLD) {
          anyActive = true;
        }
        const el = tileEls[i];
        if (el) {
          const lift = next * LIFT_MAX;
          const scale = (1 - next * (1 - SCALE_MIN)) * BASE_SCALE;
          el.style.transform = `translate3d(0, 0, ${lift.toFixed(
            2,
          )}px) scale(${scale.toFixed(4)})`;
        }
      }

      if (anyActive || pointerInside) {
        raf = requestAnimationFrame(tick);
      } else {
        raf = 0;
      }
    };

    const ensureLoop = (): void => {
      if (raf === 0) {
        raf = requestAnimationFrame(tick);
      }
    };

    const onPointerMove = (event: PointerEvent): void => {
      const r = portrait.getBoundingClientRect();
      pointerX = event.clientX - r.left;
      pointerY = event.clientY - r.top;
      pointerInside = true;
      ensureLoop();
    };

    const onPointerLeave = (): void => {
      pointerInside = false;
      ensureLoop();
    };

    portrait.addEventListener("pointermove", onPointerMove);
    portrait.addEventListener("pointerleave", onPointerLeave);

    return () => {
      portrait.removeEventListener("pointermove", onPointerMove);
      portrait.removeEventListener("pointerleave", onPointerLeave);
      resizeObs.disconnect();
      if (raf !== 0) cancelAnimationFrame(raf);
      for (const el of tileEls) {
        el.style.transform = "";
      }
    };
  }, [reducedMotion]);

  const tilesStyle: CSSProperties = {
    ["--tile-cols" as string]: TILE_COLS,
    ["--tile-rows" as string]: TILE_ROWS,
  };

  return (
    <section
      className={styles.root}
      ref={rootRef}
      aria-labelledby="hero-title"
      // Pre-hide flag consumed by the CSS rules in Hero.module.scss.
      // Stays in the SSR'd HTML so the first paint is already in the
      // hidden state; useGSAP removes it after gsap.set has put inline
      // styles in place. Reduced-motion / no-JS visitors keep it set,
      // but the matching media query / no-script path keeps content
      // visible (see SCSS).
      data-hero-pending="true"
    >
      <div
        className={styles.portrait}
        aria-hidden="true"
        ref={portraitRef}
      >
        <div className={styles.tiles} style={tilesStyle}>
          {tiles.map((t) => {
            const style: CSSProperties = {
              ["--col" as string]: t.col,
              ["--row" as string]: t.row,
            };
            return (
              <span
                key={`${t.row}-${t.col}`}
                data-tile
                className={styles.tile}
                style={style}
              />
            );
          })}
        </div>
      </div>
      <div className={styles.inner}>
        <div className={styles.topRight}>
          <div className={styles.ctas} data-reveal>
            <Link href="/projets" className={styles.ctaPrimary}>
              <span>Voir les projets</span>
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path
                  d="M5 12h14M13 6l6 6-6 6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="square"
                />
              </svg>
            </Link>
            <Link href="/contact" className={styles.ctaSecondary}>
              Me contacter
            </Link>
          </div>
          <p className={styles.lead} data-lines>
            Développeur front-end créatif freelance. Sites sur-mesure,
            animations fluides et interfaces soignées pensées comme un
            objet éditorial.
          </p>
        </div>

        {/*
          Both the "Développeur front-end créatif freelance" eyebrow and
          the LUCAS AUFRERE wordmark live inside a single <h1> for
          semantics. display:contents on the heading keeps the two lines
          as separate grid items (row 2 + row 3) — the styling is
          unchanged because .titleEyebrow and .title still target the
          original positions.
        */}
        {/*
          HTML reads "Lucas Aufrère, développeur front-end créatif freelance"
          (name first for branding, normal case, accent preserved). The
          wordmark is rendered visually in uppercase via CSS
          text-transform on .title — browsers map "è" → "È" under
          uppercase, so the visual shows LUCAS AUFRÈRE with the grave
          accent intact.

          DOM order is name → separator → eyebrow, but .titleEyebrow
          (grid-row: 2) and .title (grid-row: 3) still place themselves
          visually as before: eyebrow above, wordmark below. The comma
          separator is visually hidden but present in textContent so
          crawlers and screen readers get the full sentence.
        */}
        <h1 id="hero-title" className={styles.heading}>
          <span className={styles.title}>
            <span className={styles.titleWord} data-chars>
              Lucas
            </span>
            {" "}
            <span className={styles.titleWord} data-chars>
              Aufrère
            </span>
          </span>
          <span className={styles.titleSeparator} aria-hidden="true">
            ,{" "}
          </span>
          <span className={styles.titleEyebrow} data-lines>
            développeur front-end créatif freelance
          </span>
        </h1>

        <div className={styles.divider} data-reveal aria-hidden="true" />
      </div>
    </section>
  );
}
