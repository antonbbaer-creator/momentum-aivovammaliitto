import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { ToastProvider } from "@/lib/toast";
import dynamic from "next/dynamic";

const ChatFAB = dynamic(() => import("@/components/ChatFAB"));
const InstallPrompt = dynamic(() => import("@/components/InstallPrompt"));

export const metadata: Metadata = {
  title: "Hetki — Momentum",
  description: "Viestinnän suunnittelu- ja strategiatyökalu",
  manifest: "/manifest.webmanifest",
  applicationName: "Momentum",
  appleWebApp: {
    capable: true,
    title: "Momentum",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: '/favicon.png' },
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  openGraph: {
    title: 'Hetki — Momentum',
    description: 'Viestinnän suunnittelun strateginen kumppani',
    images: [{ url: '/brand/hetki-logo-white.png' }],
    siteName: 'Hetki Momentum',
  },
};

export const viewport: Viewport = {
  themeColor: '#056B9F',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
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
            <InstallPrompt />
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
