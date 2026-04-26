import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { NotificationContainer } from "@/components/ui/notification-container";

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
          {children}
          <NotificationContainer />
        </Providers>
      </body>
    </html>
  );
}
