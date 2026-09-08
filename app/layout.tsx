import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import type { Metadata } from 'next';
import { Karla } from 'next/font/google';
import localFont from 'next/font/local';
import Script from 'next/script';
import { loadSiteConfig } from '@/src/config/server-env';
import {
  buildPageRobotsMetadata,
  buildSiteMetadata,
  isIndexableDeployment,
} from '@/src/features/legal/discovery';
import './globals.css';
import '@/src/features/landing/landing.css';

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
  const config = loadSiteConfig(process.env);
  return {
    ...buildSiteMetadata(config),
    robots: buildPageRobotsMetadata(isIndexableDeployment(process.env.VERCEL_ENV)),
  };
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  const observabilityEnabled = process.env.NODE_ENV === 'production';

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${corpusNewsreader.variable} ${sans.variable}`}>
        {children}
        <Script src="/motion-preflight.js" strategy="beforeInteractive" />
        {observabilityEnabled && (
          <>
            <Analytics />
            <SpeedInsights />
          </>
        )}
      </body>
    </html>
  );
}
