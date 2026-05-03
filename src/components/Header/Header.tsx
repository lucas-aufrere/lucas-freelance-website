"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { TransitionLink as Link } from "@/components/transitions/TransitionLink";
import { usePathname } from "next/navigation";
import { useScrollDirection } from "@/hooks/useScrollDirection";
import { useLenis } from "@/hooks/useLenis";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { primaryNav } from "@/lib/nav";
import {
  getOpenSlug,
  subscribe as subscribeRotonde,
} from "@/components/projets/rotondeStore";
import { MobileMenu } from "./MobileMenu";
import styles from "./Header.module.scss";

function getOpenSlugServerSnapshot(): string | null {
  return null;
}

type HeaderState = "top" | "scrolled-up" | "scrolled-down";

export function Header(): React.ReactElement {
  const pathname = usePathname();
  const { direction, y } = useScrollDirection();
  const lenis = useLenis();
  const reducedMotion = usePrefersReducedMotion();
  const [menuOpen, setMenuOpen] = useState(false);
  // Hide the global header (logo + nav + burger) as soon as a project
  // is open in the rotonde — the open project view has its own close
  // button + chrome, the page header would otherwise leak through the
  // transparent areas of the project overlay.
  const projectOpenSlug = useSyncExternalStore(
    subscribeRotonde,
    getOpenSlug,
    getOpenSlugServerSnapshot,
  );
  const projectOpen = projectOpenSlug !== null;

  const headerState: HeaderState = (() => {
    if (reducedMotion) return "scrolled-up";
    if (y < 40) return "top";
    if (direction === "down") return "scrolled-down";
    return "scrolled-up";
  })();

  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    if (menuOpen) setMenuOpen(false);
  }

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
  }, []);

  // Lock scroll while the menu is open, and let Escape close it.
  useEffect(() => {
    if (!menuOpen) {
      lenis?.start();
      return;
    }
    lenis?.stop();

    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen, lenis, closeMenu]);

  const isActive = (href: string): boolean => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <header
      className={styles.root}
      data-state={headerState}
      data-menu-open={menuOpen ? "true" : "false"}
      data-project-open={projectOpen ? "true" : "false"}
    >
      <div className={styles.inner}>
        <Link href="/" className={styles.logo}>
          Lucas Aufrère
        </Link>

        <nav aria-label="Primary" className={styles.nav}>
          <ol className={styles.menu}>
            {primaryNav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={styles.link}
                  aria-current={isActive(item.href) ? "page" : undefined}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ol>
        </nav>

        <button
          type="button"
          className={styles.burger}
          aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"}
          aria-expanded={menuOpen}
          aria-controls="mobile-nav-overlay"
          onClick={() => {
            setMenuOpen((v) => !v);
          }}
        >
          <span className={styles.burgerLine} data-open={menuOpen} />
          <span className={styles.burgerLine} data-open={menuOpen} />
        </button>
      </div>

      <MobileMenu open={menuOpen} onClose={closeMenu} isActive={isActive} />
    </header>
  );
}
