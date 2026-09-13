import { describe, expect, it } from 'vitest';
import { privacySections } from '@/src/features/legal/content';
import {
  type AgentContentContext,
  agentPagePaths,
  buildLlmsTxt,
  buildMarkdownNotFound,
  canonicalPathForMarkdown,
  markdownPathFor,
  notFoundRecoveryTargets,
  renderMarkdownPage,
} from './content';

const context: AgentContentContext = {
  releaseStage: 'early-access',
  contactEmail: 'hello@corpus.example',
  postalAddress: null,
};

describe('agent-readable content', () => {
  it('renders every negotiated page with a single top-level heading', () => {
    for (const path of agentPagePaths) {
      const markdown = renderMarkdownPage(path, context);
      expect(markdown.startsWith('# '), path).toBe(true);
      expect(
        markdown.split('\n').filter((line) => line.startsWith('# ')),
        path,
      ).toHaveLength(1);
    }
  });

  it('round-trips every page between its canonical and Markdown path', () => {
    for (const path of agentPagePaths) {
      expect(canonicalPathForMarkdown(markdownPathFor(path))).toBe(path);
    }
    expect(canonicalPathForMarkdown('/not-a-page')).toBeNull();
  });

  it('renders the published legal copy rather than a second copy of it', () => {
    const markdown = renderMarkdownPage('/privacy', context);
    for (const section of privacySections) {
      expect(markdown).toContain(section.heading);
      for (const paragraph of section.paragraphs) expect(markdown).toContain(paragraph);
    }
  });

  it('offers the same recovery targets from the Markdown 404 as the HTML one', () => {
    const body = buildMarkdownNotFound();
    for (const target of notFoundRecoveryTargets) {
      expect(body).toContain(`[${target.label}](${target.path})`);
    }
  });

  it('publishes llms.txt in the documented shape with when-to-use guidance', () => {
    const llms = buildLlmsTxt(new URL('https://corpus.example/'));
    expect(llms.startsWith('# Corpus\n\n> ')).toBe(true);
    expect(llms).toContain('## When to use Corpus');
    // Every link must be absolute — agents resolve llms.txt out of context.
    const links = [...llms.matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1]);
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link.startsWith('https://corpus.example/')).toBe(true);
  });

  it('names the current release stage on the Markdown homepage', () => {
    expect(renderMarkdownPage('/', { ...context, releaseStage: 'launched' })).toContain(
      'Corpus has launched.',
    );
  });
});
