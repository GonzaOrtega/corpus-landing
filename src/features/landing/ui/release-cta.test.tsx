import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ReleaseCta } from './release-cta';

describe('ReleaseCta', () => {
  it('links early-access visitors to the signup section', () => {
    const html = renderToStaticMarkup(<ReleaseCta releaseStage="early-access" />);

    expect(html).toContain('Join early access');
    expect(html).toContain('href="#early-access"');
  });

  it('links launched visitors to the validated download destination', () => {
    const html = renderToStaticMarkup(
      <ReleaseCta
        downloadUrl={new URL('https://download.example/corpus')}
        releaseStage="launched"
      />,
    );

    expect(html).toContain('Get Corpus');
    expect(html).toContain('href="https://download.example/corpus"');
  });
});
