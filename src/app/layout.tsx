import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SessionProvider } from "@/lib/client/session";
import { AppShell } from "@/components/AppShell";

export const metadata: Metadata = {
  title: { default: "NextPlace — transfer preference organizer", template: "%s · NextPlace" },
  description: "Organize, research and rank transfer vacancy options for doctors in Sri Lanka.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#10263f" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>
          <AppShell>{children}</AppShell>
        </SessionProvider>
      </body>
    </html>
  );
}
