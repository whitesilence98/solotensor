import type { Metadata } from "next";
import "./globals.css";
import SidebarNav from "@/components/SidebarNav";

export const metadata: Metadata = {
  title: {
    default: "SoloTensor Studio",
    template: "%s · SoloTensor",
  },
  description: "A focused local workspace for generating and organizing visual assets with ComfyUI.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body>
        <a href="#main-content" className="skip-link">Skip to content</a>
        <div className="app-shell">
          <SidebarNav />
          <div className="app-content">{children}</div>
        </div>
      </body>
    </html>
  );
}
