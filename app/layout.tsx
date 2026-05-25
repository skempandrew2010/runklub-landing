import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ShellWrapper from "@/components/ShellWrapper"
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister"
import IOSInstallPrompt from "@/components/IOSInstallPrompt"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "RunKlub — Find Your Run Crew",
    template: "%s | RunKlub",
  },
  description: "Discover run clubs near you, find upcoming group runs, and connect with runners in your city. Free to join.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "RunKlub",
    statusBarStyle: "black-translucent",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
  openGraph: {
    siteName: "RunKlub",
    type: "website",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#C8F23C",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#1a2110] text-white min-h-screen`}
      >
        <ShellWrapper>
          {children}
        </ShellWrapper>
        <ServiceWorkerRegister />
        <IOSInstallPrompt />
      </body>
    </html>
  );
}
