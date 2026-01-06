import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Infra Hiring Radar (USA)",
  description: "Track hot AI infra companies hiring Senior/Staff engineers in the USA.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
