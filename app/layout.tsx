import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: " ",
  description: "Reconstruct behavioral insurance experiments from published research.",
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
