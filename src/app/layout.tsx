import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Semi_Condensed, Pirata_One } from "next/font/google";
import { ClerkProvider } from '@clerk/nextjs';
import { CLERK_APPEARANCE, CLERK_LOCALIZATION } from "../lib/clerk-theme";
import "./globals.css";
import "../styles/world-overlays.css";

// Tipografía: ART-DIRECTION §13
const pirata = Pirata_One({ variable: "--font-pirate", weight: "400", subsets: ["latin", "latin-ext"], display: "swap" });
const barlow = Barlow({ variable: "--font-ui", weight: ["500", "600", "700"], subsets: ["latin", "latin-ext"], display: "swap" });
const barlowCondensed = Barlow_Semi_Condensed({ variable: "--font-label", weight: ["600", "700"], subsets: ["latin", "latin-ext"], display: "swap" });

export const metadata: Metadata = {
  title: "Sea Battle",
  description: "Batallas navales multijugador en el navegador: navega, hunde piratas y mejora tu barco.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0f3f5c",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider appearance={CLERK_APPEARANCE} localization={CLERK_LOCALIZATION}>
      <html lang="es">
        <body className={`${pirata.variable} ${barlow.variable} ${barlowCondensed.variable} antialiased`}>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
