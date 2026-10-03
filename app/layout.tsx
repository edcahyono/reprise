import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Reprise — Mirror an experiment",
  description: "Extract a study protocol and run source-grounded AI respondent simulations.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
