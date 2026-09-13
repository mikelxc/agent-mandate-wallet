import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = { title: 'Developer tools' };

export default function AdvancedLayout({ children }: { children: ReactNode }) {
  return children;
}
