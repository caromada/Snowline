import type { Metadata } from "next";
import { JetBrains_Mono, Source_Serif_4, Space_Grotesk } from "next/font/google";
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
    "Four evidence streams fused into per-pass Sierra conditions with honest confidence.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${grotesk.variable} ${serif.variable} ${mono.variable}`}>{children}</body>
    </html>
  );
}
