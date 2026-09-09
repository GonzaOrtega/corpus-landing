import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface HeaderTransform {
  type: string;
  op: string;
  target: { key: string };
  args?: string;
}

interface VercelRoute {
  src: string;
  transforms?: HeaderTransform[];
  continue?: boolean;
}

interface VercelConfig {
  routes?: VercelRoute[];
}

const EXPECTED_VARY =
  'Accept, RSC, Next-Router-State-Tree, Next-Router-Prefetch, Next-Router-Segment-Prefetch';

describe('agent-readiness Vercel response transforms', () => {
  it('sets a cache-safe Vary header after Next renders each negotiated HTML page', () => {
    const config = JSON.parse(readFileSync('vercel.json', 'utf8')) as VercelConfig;
    const routes = config.routes ?? [];

    expect(routes.map((route) => route.src)).toEqual([
      '/',
      '/(about|contact|developers|privacy|terms)',
    ]);

    for (const route of routes) {
      expect(route.continue).toBe(true);
      expect(route.transforms).toEqual([
        {
          type: 'response.headers',
          op: 'delete',
          target: { key: 'vary' },
        },
        {
          type: 'response.headers',
          op: 'set',
          target: { key: 'vary' },
          args: EXPECTED_VARY,
        },
      ]);
    }
  });
});
