import type { Metadata, Viewport } from "next";
import "./globals.css";
import { content } from "@/lib/content";

export const metadata: Metadata = {
  title: `${content.brand} — ${content.offer.title}`,
  description: `${content.offer.subtitle} ${content.slogan}.`,
  applicationName: content.brand,
  openGraph: {
    title: `${content.brand} — ${content.offer.title}`,
    description: content.offer.subtitle,
    type: "website",
    locale: "ru_RU",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "n3c3ss — лучше так, чем никак" }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${content.brand} — ${content.offer.title}`,
    description: content.offer.subtitle,
    images: ["/og.png"],
  },
  icons: { icon: "/icon.svg", shortcut: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#010803",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
