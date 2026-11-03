import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import SidebarNav from "@/components/SidebarNav";
import { AuthProvider } from "@/lib/auth-context";
import AuthModal from "@/components/AuthModal";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta" });

export const metadata: Metadata = {
  applicationName: "Solo Studio",
  title: {
    default: "Solo Studio",
    template: "%s | Solo Studio",
  },
  description: "A private, local-first workspace for generating, organizing, and running visual AI workflows.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#0b0d0c",
};

// Inline script to prevent Flash of Unstyled Content (FOUC) by synchronizing
// the display density preference before DOM paint.
const densityInitScript = `(function(){try{var s=JSON.parse(localStorage.getItem('solotensor:settings:v1')||'{}');var d=s.displayDensity||'auto';document.documentElement.dataset.density=d;}catch(e){document.documentElement.dataset.density='auto';}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geist.variable} ${geistMono.variable} ${jakarta.variable}`}
      suppressHydrationWarning
    >
      <body className="font-sans antialiased text-ink bg-ground">
        <script dangerouslySetInnerHTML={{ __html: densityInitScript }} />
        <a href="#main-content" className="skip-link">Skip to content</a>
        <AuthProvider>
          <div className="app-shell">
            <SidebarNav />
            <div className="app-content">{children}</div>
          </div>
          <AuthModal />
        </AuthProvider>
      </body>
    </html>
  );
}
