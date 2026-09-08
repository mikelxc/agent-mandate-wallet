import type { Metadata } from 'next';
import Providers from './providers';
import './globals.css';
export const metadata: Metadata = {
  title: 'Mandate · Agent control',
  description: 'Onboard agents with scoped, owner-approved financial access.',
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
