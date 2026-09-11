import type { Metadata, Viewport } from 'next';
import Providers from './providers';
import './globals.css';
import './account-home.css';
import './spending.css';
export const viewport: Viewport = { themeColor: '#f3f4f4' };
export const metadata: Metadata = {
  applicationName: 'Wayleave',
  metadataBase: new URL('https://way-leave.vercel.app'),
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: '32x32' },
    ],
    apple: '/apple-touch-icon.png',
  },
  manifest: '/site.webmanifest',
  openGraph: {
    title: 'Wayleave — Agent wallets, owned by you',
    description:
      'One wallet for your money. Your agents request payments; you approve the spending.',
    images: [{ url: '/brand/social.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Wayleave — Agent wallets, owned by you',
    images: ['/brand/social.png'],
  },
  title: 'Wayleave · Payments',
  description:
    'Connect your wallet to your agents. Review every payment and stay in control of your spending.',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
