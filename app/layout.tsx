import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import type { Metadata } from 'next';
import { Karla } from 'next/font/google';
import localFont from 'next/font/local';
import { loadServerConfig } from '@/src/config/server-env';
import {
  buildPageRobotsMetadata,
  buildSiteMetadata,
  isIndexableDeployment,
} from '@/src/features/legal/discovery';
import './globals.css';

const corpusNewsreader = localFont({
  src: [
    { path: './fonts/newsreader-normal.woff2', weight: '300 600', style: 'normal' },
    { path: './fonts/newsreader-italic.woff2', weight: '300 500', style: 'italic' },
  ],
  display: 'swap',
  adjustFontFallback: 'Times New Roman',
  variable: '--font-serif',
});
const sans = Karla({ subsets: ['latin'], variable: '--font-sans' });

export function generateMetadata(): Metadata {
  const config = loadServerConfig(process.env);
  return {
    ...buildSiteMetadata(config),
    robots: buildPageRobotsMetadata(isIndexableDeployment(process.env.VERCEL_ENV)),
  };
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en">
      <body className={`${corpusNewsreader.variable} ${sans.variable}`}>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
