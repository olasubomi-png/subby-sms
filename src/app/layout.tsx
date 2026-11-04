import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "SUBBY SMS — Public temporary numbers via ASMS.ai",
    template: "%s | SUBBY SMS",
  },
  description:
    "Telegram bot that helps you browse free shared public temporary SMS numbers on ASMS.ai. Not for banking or private accounts.",
  robots: { index: true, follow: true },
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
