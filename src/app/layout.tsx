import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { Archivo_Black, Public_Sans, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { StoreUser } from "./store-user";
import { Analytics } from "@/components/guide/analytics";
import { BottomTabs } from "@/components/guide/bottom-tabs";
import { GuidedRail } from "@/components/guide/guided-rail";
import { PostHogProvider } from "@/components/posthog-provider";
import { AnalyticsEvents } from "@/components/guide/analytics-events";
import { SwRegister } from "@/components/guide/sw-register";
import { KofiWidget } from "@/components/kofi-widget";
import { SiteFooter, SiteHeader } from "@/components/guide/chrome";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

const displayFont = Archivo_Black({
  variable: "--font-archivo-black",
  weight: "400",
  subsets: ["latin"],
});

const bodyFont = Public_Sans({
  variable: "--font-public-sans",
  subsets: ["latin"],
});

const monoFont = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — Wisconsin Voter Guide 2026`,
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  openGraph: {
    siteName: SITE_NAME,
    type: "website",
  },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "BadgerBrief" },
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fff7ed" },
    { media: "(prefers-color-scheme: dark)", color: "#1c1b1a" },
  ],
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${displayFont.variable} ${bodyFont.variable} ${monoFont.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col pb-16 sm:pb-0">
        <Providers>
          <StoreUser />
          <SiteHeader />
          <Suspense fallback={null}>
            <GuidedRail />
          </Suspense>
          <div className="flex-1">{children}</div>
          <SiteFooter />
          <BottomTabs />
        </Providers>
        <Analytics />
        <PostHogProvider />
        <AnalyticsEvents />
        <SwRegister />
        <KofiWidget />
      </body>
    </html>
  );
}
