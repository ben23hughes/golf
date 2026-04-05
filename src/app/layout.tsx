import type { Metadata, Viewport } from "next";
import { Fraunces, Manrope } from "next/font/google";
import "./globals.css";

const bodyFont = Manrope({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const displayFont = Fraunces({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://golfbetlive.com"),
  title: "Golf Bet Live",
  description: "Track golf bets, rounds, and side games with friends.",
  applicationName: "Golf Bet Live",
  icons: {
    icon: "/appicon.png",
    apple: "/appicon.png",
    shortcut: "/appicon.png",
  },
  openGraph: {
    title: "Golf Bet Live",
    description: "Track golf bets, rounds, and side games with friends.",
    url: "https://golfbetlive.com",
    siteName: "Golf Bet Live",
    images: [
      {
        url: "/preview.png",
        width: 2924,
        height: 1394,
        alt: "Golf Bet Live",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Golf Bet Live",
    description: "Track golf bets, rounds, and side games with friends.",
    images: ["/preview.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f3efe6",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${bodyFont.variable} ${displayFont.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
