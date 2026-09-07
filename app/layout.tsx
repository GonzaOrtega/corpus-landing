import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Corpus',
  description: 'Corpus early-access landing page.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
