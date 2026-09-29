import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, JetBrains_Mono, Source_Serif_4 } from "next/font/google";
import ServiceWorker from "@/components/ServiceWorker";
import { brand } from "@/lib/brand";
import { palette } from "@/lib/theme";
import "./globals.css";

// Display face with optical sizing: tight and characterful at headline
// sizes, open at label sizes, from one variable file.
const grotesk = Bricolage_Grotesque({
  variable: "--font-grotesk",
  subsets: ["latin"],
  weight: "variable",
  axes: ["opsz"],
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
  title: { default: brand.name, template: `%s · ${brand.name}` },
  description:
    "Mountain pass conditions for Washington, Oregon and California, read every morning " +
    "from snow sensors and stream gauges, with honest confidence.",
  appleWebApp: { capable: true, title: brand.shortName, statusBarStyle: "black-translucent" },
  icons: {
    icon: [{ url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
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
