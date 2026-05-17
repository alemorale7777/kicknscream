import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://kicknscream.com"),
  title: {
    default: "KickNScream — Soccer-specific operations, built by coaches",
    template: "%s · KickNScream",
  },
  description:
    "The modern operations platform for soccer coaches, academies, and clubs. Bookings, programs, attendance, payments, comms — built mobile-first.",
  keywords: ["soccer", "coaching", "academy", "club", "youth sports", "SportsEngine alternative"],
  authors: [{ name: "KickNScream" }],
  openGraph: {
    type: "website",
    siteName: "KickNScream",
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
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-pitch-900 text-ink-50">
        <ThemeProvider>
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
        </ThemeProvider>
      </body>
    </html>
  );
}
