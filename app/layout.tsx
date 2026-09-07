import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import type { Metadata } from 'next';
import { Karla, Newsreader } from 'next/font/google';
import { loadServerConfig } from '@/src/config/server-env';
import { buildSiteMetadata } from '@/src/features/legal/discovery';
import './globals.css';

const serif = Newsreader({ subsets: ['latin'], variable: '--font-serif' });
const sans = Karla({ subsets: ['latin'], variable: '--font-sans' });

export function generateMetadata(): Metadata {
  const config = loadServerConfig(process.env);
  return buildSiteMetadata(config);
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en">
      <body className={`${serif.variable} ${sans.variable}`}>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
