import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildLlmsTxt } from '@/src/features/agent-readiness/content';
import { GET, HEAD } from './route';

describe('llms.txt route', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('serves the agent instructions as cacheable Markdown resolved against the site URL', async () => {
    vi.stubEnv('SITE_URL', 'https://corpus.example');

    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe('public, max-age=300, s-maxage=3600');
    expect(await response.text()).toBe(buildLlmsTxt(new URL('https://corpus.example')));
  });

  it('answers HEAD with the same headers and no body', async () => {
    const response = HEAD();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe('public, max-age=300, s-maxage=3600');
    expect(await response.text()).toBe('');
  });
});
