import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { ServiceWorkerRegistrar } from "@/components/pwa/ServiceWorkerRegistrar";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://kicknscream.com"),
  title: {
    default: "KickNScream — Soccer-specific operations, built by coaches",
    template: "%s · KickNScream",
  },
  description:
    "The modern operations platform for soccer coaches, academies, and clubs. Bookings, programs, attendance, payments, comms — built mobile-first.",
  keywords: ["soccer", "coaching", "academy", "club", "youth sports", "team management"],
  authors: [{ name: "KickNScream" }],
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "KickNScream",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    type: "website",
    siteName: "KickNScream",
  },
};

export const viewport: Viewport = {
  themeColor: "#0A1410",
  width: "device-width",
  initialScale: 1,
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
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-pitch-900 text-ink-50">
        <ThemeProvider>
          <InstallPrompt />
          {children}
          <Toaster
            theme="dark"
            position="top-center"
            richColors
            toastOptions={{
              style: {
                background: "var(--color-pitch-800)",
                border: "1px solid var(--color-line)",
                color: "var(--color-ink-50)",
              },
            }}
          />
          <ServiceWorkerRegistrar />
        </ThemeProvider>
      </body>
    </html>
  );
}
