import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { ToastProvider } from "@/lib/toast";
import ChatFAB from "@/components/ChatFAB";

export const metadata: Metadata = {
  title: "Hetki — Momentum",
  description: "Viestinnän suunnittelu- ja strategiatyökalu",
  icons: { icon: '/favicon.png', apple: '/favicon.png' },
  openGraph: {
    title: 'Hetki — Momentum',
    description: 'Viestinnän suunnittelun strateginen kumppani',
    images: [{ url: '/brand/hetki-logo-white.png' }],
    siteName: 'Hetki Momentum',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fi">
      <body>
        <AuthProvider>
          <ToastProvider>
            {children}
            <ChatFAB />
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
