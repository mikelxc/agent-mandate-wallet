import type { Metadata } from 'next';
import Providers from './providers';
import './globals.css';
import './account-home.css';
export const metadata: Metadata = {
  icons: { icon: '/favicon.svg' },
  title: 'Wayleave · Agent workspace',
  description: 'Give your agent a way to pay. You approve every payment.',
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
