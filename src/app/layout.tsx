import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SessionProvider } from "@/lib/client/session";
import { AppShell } from "@/components/AppShell";
import { ShellProvider } from "@/lib/client/shell";

export const metadata: Metadata = {
  title: { default: "NextPlace — transfer preference organizer", template: "%s · NextPlace" },
  description: "Organize, research and rank transfer vacancy options for doctors in Sri Lanka.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#157b76" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@500;600;700;800&display=swap" />
      </head>
      <body>
        <SessionProvider>
          <ShellProvider>
            <AppShell>{children}</AppShell>
          </ShellProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
