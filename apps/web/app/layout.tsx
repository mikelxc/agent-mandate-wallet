import type { Metadata } from 'next';
import Providers from './providers';
import './globals.css';
export const metadata: Metadata = {
  title: 'Wayleave · Agent workspace',
  description: 'Assign a job, review its authority, and follow the results.',
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
