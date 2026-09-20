import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSiteConfig } from '@/src/config/server-env';
import {
  buildCorpusStructuredData,
  serializeStructuredData,
} from '@/src/features/agent-readiness/structured-data';

// Font loaders run at module scope and need Next's build pipeline; the
// observability components and Script render nothing meaningful in static
// markup. Each becomes a marker so the layout's own decisions stay assertable.
vi.mock('next/font/google', () => ({
  Karla: () => ({ variable: '--font-sans', className: 'font-sans' }),
}));
vi.mock('next/font/local', () => ({
  default: () => ({ variable: '--font-serif', className: 'font-serif' }),
}));
vi.mock('next/script', () => ({
  default: ({ src }: { src: string }) => <script data-mock-script={src} />,
}));
vi.mock('@vercel/analytics/next', () => ({ Analytics: () => <meta name="mock-analytics" /> }));
vi.mock('@vercel/speed-insights/next', () => ({
  SpeedInsights: () => <meta name="mock-speed-insights" />,
}));

import RootLayout, { generateMetadata } from './layout';

const env = {
  SITE_URL: 'https://corpus.example',
  CORPUS_RELEASE_STAGE: 'early-access',
};

function stubEnv(overrides: Record<string, string | undefined> = {}): void {
  for (const [key, value] of Object.entries({ ...env, ...overrides })) vi.stubEnv(key, value);
}

describe('RootLayout metadata', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is indexable only on the production deployment', () => {
    stubEnv({ VERCEL_ENV: 'production' });
    expect(generateMetadata()).toMatchObject({
      metadataBase: new URL('https://corpus.example'),
      alternates: { canonical: '/', types: { 'text/markdown': '/index.md' } },
      robots: { index: true, follow: true },
    });

    stubEnv({ VERCEL_ENV: 'preview' });
    expect(generateMetadata().robots).toEqual({ index: false, follow: false });
  });
});

describe('RootLayout document', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('declares the language, font variables and JSON-LD that matches the site config', () => {
    stubEnv();

    const html = renderToStaticMarkup(
      <RootLayout params={Promise.resolve({})}>
        <p>child</p>
      </RootLayout>,
    );

    expect(html).toContain('<html lang="en"');
    expect(html).toContain('--font-serif --font-sans');
    expect(html).toContain('<p>child</p>');
    expect(html).toContain('data-mock-script="/motion-preflight.js"');
    const [, jsonLd] = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/) ?? [];
    expect(jsonLd).toBe(
      serializeStructuredData(buildCorpusStructuredData(loadSiteConfig(process.env))),
    );
    expect(jsonLd).not.toContain('<');
    expect(JSON.parse(jsonLd ?? '')['@context']).toBe('https://schema.org');
  });

  it('loads analytics only in a production build', () => {
    stubEnv({ NODE_ENV: 'production' });
    const production = renderToStaticMarkup(
      <RootLayout params={Promise.resolve({})}>
        <p />
      </RootLayout>,
    );
    expect(production).toContain('mock-analytics');
    expect(production).toContain('mock-speed-insights');

    stubEnv({ NODE_ENV: 'test' });
    const test = renderToStaticMarkup(
      <RootLayout params={Promise.resolve({})}>
        <p />
      </RootLayout>,
    );
    expect(test).not.toContain('mock-analytics');
  });
});
