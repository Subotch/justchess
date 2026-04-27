import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { NotificationContainer } from "@/components/ui/notification-container";
import { UserMenu } from "@/components/ui/user-menu";
import { HomeButton } from "@/components/ui/home-button";
import { SettingsPanel } from "@/components/ui/settings-panel";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Just Chess — Play Chess Online",
  description:
    "Play chess online with friends, compete in rated matches, or challenge AI opponents of varying difficulty.",
  keywords: ["chess", "online chess", "play chess", "chess game"],
  openGraph: {
    title: "Just Chess",
    description: "Play chess online",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>
          <div className="fixed top-4 left-4 z-50 flex flex-col gap-3 sm:flex-row">
            <HomeButton />
            <SettingsPanel />
          </div>
          <UserMenu />
          {children}
          <NotificationContainer />
        </Providers>
      </body>
    </html>
  );
}
