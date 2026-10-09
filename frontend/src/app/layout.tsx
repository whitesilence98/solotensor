import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import SidebarNav from "@/components/SidebarNav";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta" });

export const metadata: Metadata = {
  applicationName: "SoloTensor Studio",
  title: {
    default: "SoloTensor Studio",
    template: "%s | SoloTensor",
  },
  description: "A private, local-first workspace for generating, organizing, and running visual AI workflows.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#0b0d0c",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable} ${jakarta.variable}`}>
      <body className="font-sans antialiased text-ink bg-ground">
        <a href="#main-content" className="skip-link">Skip to content</a>
        <div className="app-shell">
          <SidebarNav />
          <div className="app-content">{children}</div>
        </div>
      </body>
    </html>
  );
}
