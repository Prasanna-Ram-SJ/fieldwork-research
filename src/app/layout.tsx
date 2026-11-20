import type { Metadata } from "next";
import "./globals.css";
import { ResearchProvider } from "@/components/ResearchProvider";
import { SiteNav } from "@/components/SiteNav";
export const metadata: Metadata = {
  icons: { icon: '/icon.svg' },
  title: "Fieldwork — Research with receipts",
  description:
    "Follow a question from live web search to a readable brief. Inspect the evidence behind every cited claim.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href="/fonts/fonts.css" />
      </head>
      <body>
        <a className="skip" href="#main-content">
          Skip to content
        </a>
        <ResearchProvider>
          <SiteNav />
          {children}
        </ResearchProvider>
      </body>
    </html>
  );
}
