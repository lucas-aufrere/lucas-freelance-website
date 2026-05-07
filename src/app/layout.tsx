import type { Metadata } from "next";
import { Manrope, Inter, JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { Header } from "@/components/Header/Header";
import { FooterGate } from "@/components/Footer/FooterGate";
import { SkipLink } from "@/components/SkipLink/SkipLink";
import { SmoothScrollProvider } from "@/components/SmoothScrollProvider/SmoothScrollProvider";
import { TransitionProvider } from "@/components/transitions/TransitionProvider";
import {
  defaultDescription,
  defaultTitle,
  siteName,
  siteUrl,
} from "@/lib/metadata";
import { personSchema, stringifyJsonLd } from "@/lib/structured-data";
import "./globals.scss";

const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  // Trimmed to the weights actually referenced in SCSS (300/400/500).
  // 600/700/800 were preloaded but never used — three fewer critical
  // font files, ~90KB shaved off initial download on mobile.
  weight: ["300", "400", "500"],
  variable: "--font-display",
  preload: true,
});

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500"],
  variable: "--font-body",
  preload: true,
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  weight: ["400"],
  variable: "--font-mono",
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: defaultTitle,
    template: `%s · ${siteName}`,
  },
  description: defaultDescription,
  applicationName: siteName,
  authors: [{ name: siteName, url: siteUrl }],
  creator: siteName,
  publisher: siteName,
  keywords: [
    "développeur front-end freelance",
    "freelance Next.js",
    "freelance React",
    "développeur web Clermont-Ferrand",
    "animations web",
    "GSAP",
    "Motion",
    "WordPress",
    "SEO technique",
    "Core Web Vitals",
    "white-label",
    "sites sur-mesure",
    "TypeScript",
    "Three.js",
    "WebGL",
  ],
  openGraph: {
    type: "website",
    locale: "fr_FR",
    siteName,
    title: defaultTitle,
    description: defaultDescription,
    url: siteUrl,
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: `${siteName} — ${defaultTitle}`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: defaultTitle,
    description: defaultDescription,
    images: ["/og-image.jpg"],
  },
  robots: { index: true, follow: true },
  alternates: { canonical: "/" },
  // Google Search Console property verification — emits
  // <meta name="google-site-verification" content="..." /> in <head>.
  verification: {
    google: "lZwxZ4dR1RkU9O-ll--IIhRoR6PSzzISGqINIlfznWs",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const bodyClass = [
    manrope.variable,
    inter.variable,
    jetbrainsMono.variable,
  ].join(" ");

  return (
    // suppressHydrationWarning: the inline script in <head> flips this
    // class to "js" before React hydrates, so the SSR'd "no-js" never
    // matches the client className. Documented Next.js pattern for
    // pre-hydration class flips (color-scheme, theme, JS detection).
    <html lang="fr" className="no-js" suppressHydrationWarning>
      <head>
        {/*
          JS-availability flag flipped before the body paints. SSR'd
          markup ships in the "no-js" state so visitors without JS
          (and pre-render snapshots) see the natural, fully-visible
          layout. The script runs synchronously inside <head>, so by
          the time first paint happens the class is "js" and any CSS
          gated on it (Hero's pre-hide for the intro animation) takes
          effect — no flash of fully-rendered content before useGSAP
          can run its hide-then-animate sequence.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "document.documentElement.classList.remove('no-js');document.documentElement.classList.add('js');",
          }}
        />
      </head>
      <body className={bodyClass}>
        <SkipLink />
        <SmoothScrollProvider>
          <TransitionProvider>
            <Header />
            <main id="main">{children}</main>
            <FooterGate />
          </TransitionProvider>
        </SmoothScrollProvider>
        <Analytics />
        <script
          type="application/ld+json"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: stringifyJsonLd(personSchema()) }}
        />
      </body>
    </html>
  );
}
