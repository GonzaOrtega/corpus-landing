import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import type { Metadata } from 'next';
import { Karla, Newsreader } from 'next/font/google';
import Script from 'next/script';
import { loadSiteConfig } from '@/src/config/server-env';
import { buildSiteMetadata } from '@/src/features/legal/discovery';
import './globals.css';
import '@/src/features/landing/landing.css';

const serif = Newsreader({ subsets: ['latin'], variable: '--font-serif' });
const sans = Karla({ subsets: ['latin'], variable: '--font-sans' });

export function generateMetadata(): Metadata {
  const config = loadSiteConfig(process.env);
  return buildSiteMetadata(config);
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  const observabilityEnabled = process.env.NODE_ENV === 'production';

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${serif.variable} ${sans.variable}`}>
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
