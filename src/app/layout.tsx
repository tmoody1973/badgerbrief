import type { Metadata } from "next";
import { Archivo_Black, Public_Sans, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { StoreUser } from "./store-user";
import { Analytics } from "@/components/guide/analytics";
import { AnalyticsEvents } from "@/components/guide/analytics-events";
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
      <body className="min-h-full flex flex-col">
        <Providers>
          <StoreUser />
          <SiteHeader />
          <div className="flex-1">{children}</div>
          <SiteFooter />
        </Providers>
        <Analytics />
        <AnalyticsEvents />
      </body>
    </html>
  );
}
