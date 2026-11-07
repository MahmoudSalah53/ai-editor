import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { AppHeader } from "@/components/AppHeader";
import "./globals.css";

const plex = localFont({
  variable: "--font-plex",
  display: "swap",
  src: [
    { path: "./fonts/IBMPlexSansArabic-Regular.ttf", weight: "400" },
    { path: "./fonts/IBMPlexSansArabic-Medium.ttf", weight: "500" },
    { path: "./fonts/IBMPlexSansArabic-SemiBold.ttf", weight: "600" },
    { path: "./fonts/IBMPlexSansArabic-Bold.ttf", weight: "700" },
  ],
});

export const metadata: Metadata = {
  title: { default: "استوديو الريلز", template: "%s · استوديو الريلز" },
  description: "إنتاج ريلز الأحاديث والآثار من التسجيل الصوتي",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f6f6f4",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ar" dir="rtl" className={`${plex.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <AppHeader />
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
