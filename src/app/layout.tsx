import type { Metadata } from "next";
// import { Inter } from "next/font/google"; // Закомментировано — вызывает таймаут при сборке на Amvera
import "./globals.css";
import { Providers } from "@/components/providers";
import { NotificationContainer } from "@/components/ui/notification-container";
import { TopBar } from "@/components/ui/top-bar";
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
    <html lang="ru" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <Providers>
          <TopBar />
          <AuthLoadingOverlay />
          <main className="pt-16">
            {children}
          </main>
          <NotificationContainer />
        </Providers>
      </body>
    </html>
  );
}
