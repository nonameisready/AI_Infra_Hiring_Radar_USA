import "./globals.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "AI Hiring Radar — AI Engineering & Forward Deployed roles",
  description:
    "Track fresh AI infra, AI engineering, agentic and forward-deployed engineering roles across 100+ company job boards, and apply with one click.",
};

export const viewport: Viewport = {
  themeColor: "#08090c",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
