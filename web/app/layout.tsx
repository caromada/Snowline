import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Source_Serif_4, Space_Grotesk } from "next/font/google";
import ServiceWorker from "@/components/ServiceWorker";
import { palette } from "@/lib/theme";
import "./globals.css";

const grotesk = Space_Grotesk({
  variable: "--font-grotesk",
  subsets: ["latin"],
  weight: ["500", "600"],
});

const serif = Source_Serif_4({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["400", "600"],
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "600"],
});

export const metadata: Metadata = {
  title: "Sierra Pass Report",
  description:
    "Mountain pass conditions for Washington, Oregon and California: sensors, satellite " +
    "and trip reports fused with honest confidence.",
  appleWebApp: { capable: true, title: "Pass Report", statusBarStyle: "black-translucent" },
  icons: {
    icon: [{ url: "icons/favicon-32.png", sizes: "32x32", type: "image/png" }],
    apple: [{ url: "icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: palette.deepPine,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${grotesk.variable} ${serif.variable} ${mono.variable}`}>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
