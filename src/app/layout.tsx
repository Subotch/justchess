import type { Metadata } from "next";
// import { Inter } from "next/font/google"; // Закомментировано — вызывает таймаут при сборке на Amvera
import "./globals.css";
import { Providers } from "@/components/providers";
import { NotificationContainer } from "@/components/ui/notification-container";
import { UserMenu } from "@/components/ui/user-menu";
import { HomeButton } from "@/components/ui/home-button";
import { SettingsPanel } from "@/components/ui/settings-panel";
import { AuthLoadingOverlay } from "@/components/ui/auth-loading-overlay";

// const inter = Inter({ subsets: ["latin"] }); // Закомментировано — используется системный шрифт

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
      <body className="font-sans antialiased"> {/* inter.className заменён на системный шрифт */}
        <Providers>
          <div className="fixed top-4 left-4 z-50 flex flex-col gap-3 sm:flex-row">
            <HomeButton />
            <SettingsPanel />
          </div>
          <UserMenu />
          <AuthLoadingOverlay />
          {children}
          <NotificationContainer />
        </Providers>
      </body>
    </html>
  );
}
