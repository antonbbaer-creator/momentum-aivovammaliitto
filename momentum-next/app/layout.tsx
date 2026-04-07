import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { ToastProvider } from "@/lib/toast";

export const metadata: Metadata = {
  title: "Hetki \u2014 Momentum",
  description: "Viestinn\u00e4n suunnittelu- ja strategiaty\u00f6kalu",
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
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
