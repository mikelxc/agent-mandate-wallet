import type { Metadata } from 'next';
import { EntryPage } from '../components/entry-page';

export const metadata: Metadata = {
  title: { absolute: 'Page not found · Wayleave' },
};

export default function NotFound() {
  return <EntryPage variant="not-found" />;
}
