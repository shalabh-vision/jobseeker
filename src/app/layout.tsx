import type { Metadata } from "next";
import Script from "next/script";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Nav } from "@/components/nav";
import "./globals.css";

// Self-hosted by next/font; globals.css puts it first in --font-sans.
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta" });

export const metadata: Metadata = {
  title: { default: "Sahi Naukri", template: "%s · Sahi Naukri" },
  description: "Personal job search: discovery, applications and interview preparation",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`h-full antialiased ${jakarta.variable}`}>
      <body className="min-h-full flex flex-col">
        <Nav />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
        {/* App switcher served by AppHub (D:/AppHub/switcher.js); absent when the hub is not running. */}
        <Script src="http://localhost:3000/__hub/switcher.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
