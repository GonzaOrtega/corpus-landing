import type { Metadata } from 'next';
import { Karla, Newsreader } from 'next/font/google';
import './globals.css';

const serif = Newsreader({ subsets: ['latin'], variable: '--font-serif' });
const sans = Karla({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'Corpus',
  description: 'Corpus early-access landing page.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en">
      <body className={`${serif.variable} ${sans.variable}`}>{children}</body>
    </html>
  );
}
