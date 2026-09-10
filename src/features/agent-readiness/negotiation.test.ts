import { describe, expect, it } from 'vitest';
import { negotiateRepresentation } from './negotiation';

describe('Accept negotiation', () => {
  it('serves HTML when no preference is expressed', () => {
    expect(negotiateRepresentation(null)).toBe('html');
    expect(negotiateRepresentation('')).toBe('html');
    expect(negotiateRepresentation('   ')).toBe('html');
  });

  it('serves HTML to a browser navigation Accept header', () => {
    expect(
      negotiateRepresentation(
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      ),
    ).toBe('html');
  });

  it('serves Markdown when an agent asks for it outright', () => {
    expect(negotiateRepresentation('text/markdown')).toBe('markdown');
    expect(negotiateRepresentation('text/markdown, text/html;q=0.8')).toBe('markdown');
  });

  it('honours q-values over header order', () => {
    expect(negotiateRepresentation('text/html;q=0.4, text/markdown;q=0.9')).toBe('markdown');
    expect(negotiateRepresentation('text/markdown;q=0.4, text/html;q=0.9')).toBe('html');
  });

  it('prefers an exact media range over a wildcard', () => {
    expect(negotiateRepresentation('text/markdown;q=0, */*')).toBe('html');
    expect(negotiateRepresentation('text/markdown, text/*;q=0')).toBe('markdown');
  });

  it('breaks ties on the server preference for HTML', () => {
    expect(negotiateRepresentation('text/markdown, text/html')).toBe('markdown');
    expect(negotiateRepresentation('*/*')).toBe('html');
    expect(negotiateRepresentation('text/*')).toBe('html');
  });

  it('reports an explicit HTML refusal so the Proxy can answer 406', () => {
    expect(negotiateRepresentation('text/html;q=0')).toBe('html-rejected');
    expect(negotiateRepresentation('text/html;q=0, application/pdf')).toBe('html-rejected');
    expect(negotiateRepresentation('application/json, */*;q=0')).toBe('html-rejected');
  });

  it('falls back to HTML for a narrow Accept that never mentions HTML', () => {
    // RFC 9110 §12.5.1 permits disregarding Accept rather than failing. Uptime
    // monitors, link checkers and JSON-first agents must still get the page.
    expect(negotiateRepresentation('application/json')).toBe('html');
    expect(negotiateRepresentation('application/pdf')).toBe('html');
    expect(negotiateRepresentation('image/png, image/webp')).toBe('html');
  });

  it('ignores malformed weights instead of treating them as a refusal', () => {
    expect(negotiateRepresentation('text/html;q=high')).toBe('html');
    expect(negotiateRepresentation('text/markdown;q=,text/html;q=0.1')).toBe('markdown');
  });

  it('ignores unparseable media ranges without discarding the rest', () => {
    expect(negotiateRepresentation('not-a-media-range, text/markdown')).toBe('markdown');
    expect(negotiateRepresentation(',,,')).toBe('html');
  });

  it('is case-insensitive and tolerates whitespace', () => {
    expect(negotiateRepresentation('  TEXT/MARKDOWN ;  Q=1.0 ')).toBe('markdown');
  });
});
