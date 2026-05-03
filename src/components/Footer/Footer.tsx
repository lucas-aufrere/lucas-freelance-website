"use client";

import type { ReactNode } from "react";
import { TransitionLink as Link } from "@/components/transitions/TransitionLink";
import { contactLinks, footerNav } from "@/lib/nav";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import styles from "./Footer.module.scss";

interface FooterProps {
  // Compact mode strips the editorial top (Parlons-en headline + CTAs)
  // so pages that already have their own contact entry point (e.g.
  // /contact) only render the utility nav band at the bottom.
  readonly compact?: boolean;
}

// Each block has its OWN useScrollReveal so its split-line animation
// fires when that block actually enters the viewport — not when the
// footer's top crosses the trigger line (which used to fire the
// "Parlons-en" reveal way before it was visible). Default start is
// "top 70%" — once the block's top is 30% from the viewport's bottom.

function HeaderRow(): ReactNode {
  const ref = useScrollReveal<HTMLDivElement>();
  return (
    <div className={styles.headerRow} ref={ref}>
      <p className={styles.eyebrow}>
        <span className={styles.eyebrowIndex} data-lines>
          Disponible
        </span>
        <span className={styles.eyebrowLabel} data-lines>
          2025 – 2026
        </span>
      </p>
      <p className={styles.lead} data-lines>
        Un projet en cours, une réécriture à prévoir, une mission en
        renfort pour un studio — les bons projets démarrent souvent
        par un message court.
      </p>
    </div>
  );
}

function TitleBlock(): ReactNode {
  const ref = useScrollReveal<HTMLHeadingElement>({ start: "top 80%" });
  return (
    <h2
      className={styles.title}
      aria-label="Parlons-en"
      ref={ref}
    >
      <span className={styles.titleWord} data-lines>
        PARLONS-EN.
      </span>
    </h2>
  );
}

function DividerBlock(): ReactNode {
  const ref = useScrollReveal<HTMLDivElement>({ start: "top 85%" });
  return (
    <div className={styles.divider} aria-hidden="true" data-reveal ref={ref} />
  );
}

function ActionsBlock(): ReactNode {
  const ref = useScrollReveal<HTMLDivElement>();
  return (
    <div className={styles.actions} ref={ref}>
      <div className={styles.mail}>
        <p className={styles.mailLabel} data-lines>
          Écrire directement
        </p>
        <a
          className={styles.mailLink}
          href="mailto:lucas@fyconic.fr"
          data-lines
        >
          lucas@fyconic.fr
        </a>
      </div>
      <div className={styles.ctas}>
        <Link href="/contact" className={styles.ctaPrimary} data-reveal>
          <span>Démarrer un projet</span>
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            aria-hidden="true"
          >
            <path
              d="M5 12h14M13 6l6 6-6 6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="square"
            />
          </svg>
        </Link>
        <Link href="/a-propos" className={styles.ctaSecondary} data-reveal>
          À propos
        </Link>
      </div>
    </div>
  );
}

interface UtilityBlockProps {
  readonly year: number;
}

function UtilityBlock({ year }: UtilityBlockProps): ReactNode {
  // Earlier trigger ("top 90%") so the band fires as soon as it
  // enters the viewport from the bottom — the default "top 70%" can
  // never fire on viewports where the band sits at the very bottom of
  // the document and the user can't scroll any further.
  const ref = useScrollReveal<HTMLDivElement>({ start: "top 90%" });
  return (
    <div className={styles.utility} ref={ref}>
      <section className={styles.section}>
        <p className={styles.signatureName} data-lines>
          Lucas Aufrère
        </p>
        <p className={styles.signatureRole} data-lines>
          Développeur front-end créatif freelance
        </p>
      </section>

      <section className={styles.section}>
        <h3 className={styles.heading} data-lines>
          Navigation
        </h3>
        <ul className={styles.list}>
          {footerNav.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className={styles.link} data-lines>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.section}>
        <h3 className={styles.heading} data-lines>
          Contact
        </h3>
        <ul className={styles.list}>
          {contactLinks.map((item) => (
            <li key={item.href}>
              <a
                href={item.href}
                className={styles.link}
                data-lines
                rel={
                  item.href.startsWith("http")
                    ? "noopener noreferrer"
                    : undefined
                }
                target={item.href.startsWith("http") ? "_blank" : undefined}
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.section}>
        <p className={styles.meta} data-lines>
          © {year} · Clermont-Ferrand
        </p>
        <p className={styles.meta} data-lines>
          Designed &amp; built in-house
        </p>
      </section>
    </div>
  );
}

export function Footer({ compact = false }: FooterProps): React.ReactElement {
  const year = new Date().getFullYear();
  return (
    <footer
      role="contentinfo"
      className={`${styles.root} ${compact ? styles.rootCompact : ""}`}
    >
      <div className={styles.inner}>
        {compact ? null : (
          <>
            <HeaderRow />
            <TitleBlock />
            <DividerBlock />
            <ActionsBlock />
          </>
        )}

        <UtilityBlock year={year} />
      </div>
    </footer>
  );
}
