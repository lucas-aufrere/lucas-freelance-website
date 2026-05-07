"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  AnimatePresence,
  animate,
  motion,
  useReducedMotion,
} from "motion/react";
import { ScrollTrigger } from "@/lib/gsap";
import { getLenisSnapshot } from "@/lib/lenis";
import { waitForReady as waitForAssetGate } from "@/lib/transitionGate";
import styles from "./TransitionProvider.module.scss";

// Page-transition curtain orchestrated with Motion's AnimatePresence.
// Sequence on every SPA navigation:
//   1. cover  — overlay rises from below to fill the viewport
//   2. push   — once cover lands, router.push fires; we also reset Lenis
//               scroll + ScrollTrigger so the new page's animations
//               evaluate against scroll=0
//   3. hold   — 400ms grace so the new route's React tree commits before
//               we start the uncover (otherwise the user sees a flash of
//               the new page mid-render)
//   4. uncover — overlay keeps going up, out of the viewport (handled by
//               AnimatePresence exit prop when isTransitioning flips back)
//
// Browser back/forward fires popstate; we don't animate those — letting
// AnimatePresence skip avoids fighting the browser's own scroll restoration.

const COVER_HOLD_AFTER_PUSH_MS = 400;
// Hard cap on how long we'll wait for the destination route to signal
// it has painted its first frame. The asset gate is best-effort —
// pages without heavy async assets resolve immediately, and a missing
// release (network failure, dev HMR) can never freeze the curtain.
const ASSET_READY_MAX_MS = 2000;
// Slow start → fast end curve: the first ~20% barely moves, then the
// curtain accelerates toward its landing. Same curve drives cover and
// uncover, so both feel like they build momentum as they sweep across
// the viewport.
const EASE_SLOW_TO_FAST = [0.988, 0.369, 0.188, 0.997] as const;
const ANIMATION_DURATION = 0.8;
// Counter goes from 1 → 99 over the visible curtain time (cover + hold +
// most of the uncover). Tuned so it lands near the end of the sequence.
const LOADER_COUNT_DURATION = 1.6;
const LOADER_COUNT_MIN = 1;
const LOADER_COUNT_MAX = 99;

interface TransitionContextValue {
  readonly navigate: (href: string) => void;
  readonly isTransitioning: boolean;
  // isReady is true only when no curtain is on screen — including the
  // uncover exit phase. Components with entry animations gate on this so
  // they don't play behind the curtain and look finished once it lifts.
  readonly isReady: boolean;
}

const TransitionContext = createContext<TransitionContextValue | null>(null);

export function useTransition(): TransitionContextValue {
  const ctx = useContext(TransitionContext);
  if (!ctx) {
    throw new Error("useTransition must be used inside TransitionProvider");
  }
  return ctx;
}

interface TransitionProviderProps {
  readonly children: ReactNode;
}

export function TransitionProvider({
  children,
}: TransitionProviderProps): React.ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const reducedMotion = useReducedMotion();

  const [isTransitioning, setIsTransitioning] = useState(false);
  // Starts true so the initial page load (no curtain) can animate normally.
  // navigate() flips to false; AnimatePresence's onExitComplete flips back
  // to true once the uncover exit has actually finished.
  const [isReady, setIsReady] = useState(true);
  const pendingHrefRef = useRef<string | null>(null);
  const isPopStateRef = useRef(false);
  const numberRef = useRef<HTMLSpanElement | null>(null);
  const progressFillRef = useRef<HTMLDivElement | null>(null);

  const resetScrollAndRefresh = useCallback((): void => {
    const lenis = getLenisSnapshot();
    if (lenis) {
      lenis.scrollTo(0, { immediate: true, force: true, lock: false });
    } else if (typeof window !== "undefined") {
      window.scrollTo(0, 0);
    }
    requestAnimationFrame(() => {
      ScrollTrigger.refresh();
    });
  }, []);

  const navigate = useCallback(
    (href: string): void => {
      if (isTransitioning) return;
      if (href === pathname) return;

      // Reduced motion path — skip the animation entirely.
      if (reducedMotion) {
        resetScrollAndRefresh();
        router.push(href);
        return;
      }

      pendingHrefRef.current = href;
      setIsTransitioning(true);
      setIsReady(false);
    },
    [isTransitioning, pathname, reducedMotion, resetScrollAndRefresh, router],
  );

  // Handle the "covered" moment — fired by Motion when the cover
  // animation (initial -> animate) completes. The overlay now fully
  // hides the page; perform the route change, then hold the curtain
  // until either (a) the new route signals its heavy assets have
  // painted via the transition gate, or (b) the safety cap elapses.
  // The 400ms grace gives React time to commit the new tree (and let
  // its top-level component register its hold) before we start
  // awaiting the gate.
  const handleCoverComplete = useCallback((): void => {
    const href = pendingHrefRef.current;
    if (!href) {
      setIsTransitioning(false);
      return;
    }
    resetScrollAndRefresh();
    router.push(href);
    pendingHrefRef.current = null;
    window.setTimeout(() => {
      void waitForAssetGate(ASSET_READY_MAX_MS).then(() => {
        setIsTransitioning(false);
      });
    }, COVER_HOLD_AFTER_PUSH_MS);
  }, [resetScrollAndRefresh, router]);

  // Browser back/forward should not be wrapped in the curtain — let the
  // browser drive scroll restoration and skip our overlay sequence.
  useEffect(() => {
    const onPopState = (): void => {
      isPopStateRef.current = true;
      pendingHrefRef.current = null;
      setIsTransitioning(false);
      setIsReady(true);
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  // Whenever the committed pathname changes via popstate (browser
  // navigation), make sure our flag is reset so future link clicks still
  // trigger the curtain.
  useEffect(() => {
    if (isPopStateRef.current) {
      isPopStateRef.current = false;
    }
  }, [pathname]);

  // Imperative loader: when the curtain becomes active we drive the
  // counter (1 → 99) and the progress bar (scaleX 0 → 1) with Motion's
  // `animate` driver and write straight to the DOM. Skipping React state
  // here keeps the per-frame updates cheap and avoids re-rendering the
  // whole provider tree 60 times during a transition.
  useEffect(() => {
    if (!isTransitioning) return;
    if (reducedMotion) return;
    if (numberRef.current) {
      numberRef.current.textContent = String(LOADER_COUNT_MIN);
    }
    if (progressFillRef.current) {
      progressFillRef.current.style.transform = "scaleX(0)";
    }
    const controls = animate(LOADER_COUNT_MIN, LOADER_COUNT_MAX, {
      duration: LOADER_COUNT_DURATION,
      ease: [0.65, 0, 0.35, 1],
      onUpdate: (value) => {
        if (numberRef.current) {
          numberRef.current.textContent = String(Math.round(value));
        }
        if (progressFillRef.current) {
          const t =
            (value - LOADER_COUNT_MIN) / (LOADER_COUNT_MAX - LOADER_COUNT_MIN);
          progressFillRef.current.style.transform = `scaleX(${t.toFixed(4)})`;
        }
      },
    });
    return () => {
      controls.stop();
    };
  }, [isTransitioning, reducedMotion]);

  // After every committed pathname change, refresh ScrollTrigger so the
  // new page's freshly-mounted triggers (created by useScrollReveal in
  // child components) re-evaluate their start/end positions against the
  // new document layout + scroll = 0. Without this, triggers above the
  // fold use stale measurements from the previous route and never fire
  // onEnter, leaving split-line text frozen in its hidden state until a
  // hard reload. Two rAFs let React commit the new tree first.
  useEffect(() => {
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        ScrollTrigger.refresh();
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, [pathname]);

  const ctxValue: TransitionContextValue = {
    navigate,
    isTransitioning,
    isReady,
  };

  return (
    <TransitionContext.Provider value={ctxValue}>
      {children}
      <AnimatePresence
        mode="wait"
        onExitComplete={() => {
          setIsReady(true);
        }}
      >
        {isTransitioning ? (
          <motion.div
            key="page-transition-overlay"
            className={styles.overlay}
            initial={{ y: "100%" }}
            animate={{ y: "0%" }}
            exit={{ y: "-100%" }}
            transition={{
              duration: ANIMATION_DURATION,
              ease: EASE_SLOW_TO_FAST,
            }}
            onAnimationComplete={(definition) => {
              // Motion fires onAnimationComplete for both `animate` and
              // `exit` phases — only the cover (animate -> y:0) should
              // trigger the route change.
              if (
                typeof definition === "object" &&
                definition !== null &&
                "y" in definition &&
                definition.y === "0%"
              ) {
                handleCoverComplete();
              }
            }}
          >
            <div className={styles.loader} aria-hidden="true">
              <span ref={numberRef} className={styles.number}>
                {LOADER_COUNT_MIN}
              </span>
              <div className={styles.progressTrack}>
                <div ref={progressFillRef} className={styles.progressFill} />
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </TransitionContext.Provider>
  );
}
