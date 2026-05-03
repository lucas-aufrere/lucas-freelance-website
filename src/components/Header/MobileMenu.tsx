"use client";

import {
  useSyncExternalStore,
  type ReactElement,
} from "react";
import { createPortal } from "react-dom";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type Variants,
} from "motion/react";
import { TransitionLink as Link } from "@/components/transitions/TransitionLink";
import { GlitchLink } from "./GlitchLink";
import { primaryNav } from "@/lib/nav";
import styles from "./MobileMenu.module.scss";

interface MobileMenuProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly isActive: (href: string) => boolean;
}

// Easing shared with the page-transition curtain so opening / closing the
// menu feels like the same material as route changes.
const MENU_EASE = [0.869, 0.365, 0.159, 0.992] as const;
const MENU_DURATION = 0.8;
const LINK_DURATION = 0.6;
const LINK_EASE_OUT = [0.22, 1, 0.36, 1] as const;
const LINK_EASE_IN = [0.64, 0, 0.78, 0] as const;
const LINK_STAGGER = 0.07;

// Parent (overlay) orchestrates children (links) via variants:
//   - on open, overlay slides in from the right (x: 100% → 0%), then
//     links reveal staggered vertically behind the fresh surface
//   - on close, links recoil first, then overlay slides back out to
//     the right (x: 0% → 100%)
const overlayVariants: Variants = {
  closed: {
    x: "100%",
    transition: {
      duration: MENU_DURATION,
      ease: MENU_EASE,
      when: "afterChildren",
      staggerChildren: LINK_STAGGER / 2,
      staggerDirection: -1,
    },
  },
  open: {
    x: "0%",
    transition: {
      duration: MENU_DURATION,
      ease: MENU_EASE,
      when: "beforeChildren",
      // Trimmed delay — links start revealing earlier, just after the
      // curtain crosses the midpoint of its slide-in.
      delayChildren: MENU_DURATION * 0.3,
      staggerChildren: LINK_STAGGER,
    },
  },
};

const linkVariants: Variants = {
  closed: {
    y: "110%",
    transition: { duration: 0.35, ease: LINK_EASE_IN },
  },
  open: {
    y: "0%",
    transition: { duration: LINK_DURATION, ease: LINK_EASE_OUT },
  },
};

// Reduced-motion fallback: panel + links snap in/out without slide,
// stagger or curtain. Visitors with prefers-reduced-motion still get
// a fully usable menu, just no transition theatre.
const overlayVariantsReduced: Variants = {
  closed: { x: "0%", opacity: 0, transition: { duration: 0 } },
  open: { x: "0%", opacity: 1, transition: { duration: 0 } },
};

const linkVariantsReduced: Variants = {
  closed: { y: "0%", transition: { duration: 0 } },
  open: { y: "0%", transition: { duration: 0 } },
};

function subscribeNoop(): () => void {
  return () => {};
}
function getClientSnapshot(): boolean {
  return true;
}
function getServerSnapshot(): boolean {
  return false;
}

export function MobileMenu({
  open,
  onClose,
  isActive,
}: MobileMenuProps): ReactElement | null {
  const mounted = useSyncExternalStore(
    subscribeNoop,
    getClientSnapshot,
    getServerSnapshot,
  );
  const reducedMotion = useReducedMotion() ?? false;
  const overlayVariantsActive = reducedMotion
    ? overlayVariantsReduced
    : overlayVariants;
  const linkVariantsActive = reducedMotion ? linkVariantsReduced : linkVariants;

  const node = (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="mobile-menu-overlay"
          id="mobile-nav-overlay"
          className={styles.overlay}
          role="dialog"
          aria-modal="true"
          aria-label="Navigation principale"
          variants={overlayVariantsActive}
          initial="closed"
          animate="open"
          exit="closed"
        >
          <div className={styles.topBar}>
            <Link href="/" className={styles.logo} onClick={onClose}>
              Lucas Aufrère
            </Link>
            <button
              type="button"
              className={styles.closeButton}
              aria-label="Fermer le menu"
              onClick={onClose}
            >
              <span className={styles.closeLine} />
              <span className={styles.closeLine} />
            </button>
          </div>

          <nav
            aria-label="Menu mobile"
            className={styles.nav}
          >
            <ol className={styles.list}>
              {primaryNav.map((item, index) => (
                <li key={item.href} className={styles.item}>
                  <span className={styles.itemIndex}>
                    {(index + 1).toString().padStart(2, "0")}
                  </span>
                  <span className={styles.linkMask}>
                    <motion.span
                      className={styles.linkInner}
                      variants={linkVariantsActive}
                    >
                      <GlitchLink
                        href={item.href}
                        label={item.label}
                        className={styles.link}
                        textClassName={styles.linkText}
                        active={isActive(item.href)}
                        onClick={onClose}
                      />
                    </motion.span>
                  </span>
                </li>
              ))}
            </ol>
          </nav>

          <div className={styles.footer}>
            <motion.span className={styles.linkMask} variants={linkVariantsActive}>
              <a
                href="mailto:lucas@fyconic.fr"
                className={styles.footerEmail}
              >
                lucas@fyconic.fr
              </a>
            </motion.span>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  if (!mounted || typeof document === "undefined") return null;
  return createPortal(node, document.body);
}
