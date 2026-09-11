import type { Metadata } from 'next';
import Providers from './providers';
import './globals.css';
import './account-home.css';
import './spending.css';
export const metadata: Metadata = {
  icons: { icon: '/favicon.svg' },
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
