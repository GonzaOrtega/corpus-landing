import type { ReleaseStage } from '@/src/config/release-stage';
import { landingContent } from '@/src/features/landing/content/landing-content';
import { privacySections, termsSections } from '@/src/features/legal/content';

export type AgentPagePath = '/' | '/about' | '/contact' | '/developers' | '/privacy' | '/terms';

export interface AgentContentContext {
  releaseStage: ReleaseStage;
  contactEmail?: string | null;
  postalAddress?: string | null;
}

export interface InformationSection {
  heading: string;
  paragraphs: readonly string[];
}

export interface RecoveryTarget {
  path: string;
  label: string;
}

export const aboutSections: readonly InformationSection[] = [
  {
    heading: 'What Corpus is',
    paragraphs: [
      'Corpus is a vocabulary-learning product built around words you encounter in real life. Instead of beginning with a generic word list, it starts with the vocabulary you notice while reading, listening, travelling, studying, working, or talking with other people. A captured word becomes part of a personal lexicon that can later be enriched with meaning, pronunciation, examples, and practice material.',
      'The product is designed to make capture deliberately small: one word is enough. Context, source, and categorisation are optional, and enrichment happens after capture rather than blocking it. Practice then draws from that personal lexicon so the learner repeatedly meets vocabulary that already has a real-world association.',
    ],
  },
  {
    heading: 'Why it exists',
    paragraphs: [
      'Corpus is intended for learners who already meet useful vocabulary in books, podcasts, conversations, signs, articles, classes, and everyday work but lose those words because recording and reviewing them takes too much effort. The product focuses on reducing that friction without pretending that automatic enrichment replaces the learner’s own context or judgement.',
    ],
  },
  {
    heading: 'Current stage',
    paragraphs: [
      'Corpus is currently in private development. There is no public App Store or Play Store listing yet, and early access begins on Android. Product availability, distribution details, and individual features may change before release. This site is the canonical public source for the current product status and early-access information.',
    ],
  },
];

export const contactSections: readonly InformationSection[] = [
  {
    heading: 'What to contact Corpus about',
    paragraphs: [
      'Use the published Corpus contact details for questions about the early-access list, privacy, product information on this site, accessibility, security reporting routes, or corrections to public information. If you are contacting us about an early-access subscription, do not post private management links or tokens in public issues, social media, or other shared channels.',
      'Developer and integration questions are also welcome, but Corpus does not currently expose a public API, SDK, authentication API, OpenAPI contract, or MCP server. The developer resources page records the current machine-readable surfaces and will be updated if public integration capabilities become available.',
    ],
  },
  {
    heading: 'How contact information is used',
    paragraphs: [
      'Messages sent through a published contact address are used to understand and respond to the request. Contacting Corpus does not automatically add an address to the early-access list. Joining early access remains a separate action with its own consent and lifecycle controls, described on the Privacy page.',
    ],
  },
  {
    heading: 'Product-stage expectations',
    paragraphs: [
      'Corpus is a pre-release product, so support is focused on the public site and early-access process rather than on a generally available application. We do not promise a release date or a response-time service level on this page. The canonical domain and the machine-readable resources linked from llms.txt are the best sources for agents checking current product status.',
    ],
  },
];

export const developerSections: readonly InformationSection[] = [
  {
    heading: 'Current integration status',
    paragraphs: [
      'Corpus is currently a pre-release vocabulary product. There is no public API, no public SDK, no public authentication API, no published OpenAPI specification, and no public MCP server. Agents and developers should not infer undocumented integration endpoints from the landing application or its internal request traffic.',
    ],
  },
  {
    heading: 'Machine-readable resources',
    paragraphs: [
      'Use /llms.txt for agent-oriented discovery and when-to-use guidance, /sitemap.xml for canonical public pages, /robots.txt for crawler policy, and the text/markdown representation of public content pages when a compact text representation is preferable. Public HTML pages advertise their Markdown alternate representation in the Link response header.',
    ],
  },
  {
    heading: 'Future developer capabilities',
    paragraphs: [
      'If Corpus later publishes an API, SDK, authentication documentation, an OpenAPI document, or an MCP server, those resources will be listed here and in /llms.txt at predictable canonical URLs. Until then, this page is intentionally explicit about the absence of a public integration contract so automated systems do not invent one.',
    ],
  },
];

const markdownPaths = new Map<string, AgentPagePath>([
  ['/index.md', '/'],
  ['/about.md', '/about'],
  ['/contact.md', '/contact'],
  ['/developers.md', '/developers'],
  ['/privacy.md', '/privacy'],
  ['/terms.md', '/terms'],
]);

export const agentPagePaths: readonly AgentPagePath[] = [
  '/',
  '/about',
  '/contact',
  '/developers',
  '/privacy',
  '/terms',
];

export function markdownPathFor(path: AgentPagePath): string {
  return path === '/' ? '/index.md' : `${path}.md`;
}

export function canonicalPathForMarkdown(pathname: string): AgentPagePath | null {
  return markdownPaths.get(pathname) ?? null;
}

function renderSections(sections: readonly InformationSection[]): string {
  return sections
    .map((section) => `## ${section.heading}\n\n${section.paragraphs.join('\n\n')}`)
    .join('\n\n');
}

function contactDetails(context: AgentContentContext): string {
  const details = [
    context.contactEmail ? `- Email: ${context.contactEmail}` : null,
    context.postalAddress ? `- Postal address: ${context.postalAddress}` : null,
  ].filter((detail): detail is string => detail !== null);
  return details.length > 0 ? `\n\n## Published contact details\n\n${details.join('\n')}` : '';
}

function renderHome(context: AgentContentContext): string {
  const stage =
    context.releaseStage === 'launched'
      ? 'Corpus has launched. Use the canonical site for the current download destination.'
      : landingContent.hero.note;
  const stages = landingContent.stages
    .map(([name, summary, detail]) => `## ${name}\n\n**${summary}**\n\n${detail}`)
    .join('\n\n');

  return `# Corpus\n\n> ${landingContent.hero.heading}\n\n${landingContent.hero.lede}\n\n${stage}\n\n${stages}\n\n## Public resources\n\n- [About Corpus](/about)\n- [Contact Corpus](/contact)\n- [Corpus Developer Resources](/developers)\n- [Privacy](/privacy)\n- [Terms](/terms)\n- [Agent instructions](/llms.txt)\n- [Sitemap](/sitemap.xml)`;
}

export function renderMarkdownPage(path: AgentPagePath, context: AgentContentContext): string {
  if (path === '/') return renderHome(context);
  if (path === '/about') {
    return `# About Corpus\n\n> What Corpus is, why it exists, and its current product stage.\n\n${renderSections(aboutSections)}`;
  }
  if (path === '/contact') {
    return `# Contact Corpus\n\n> How to contact Corpus and what the public support channel is for.\n\n${renderSections(contactSections)}${contactDetails(context)}`;
  }
  if (path === '/developers') {
    return `# Corpus Developer Resources\n\n> Current integration status and machine-readable resources for Corpus.\n\n${renderSections(developerSections)}`;
  }
  if (path === '/privacy') {
    return `# Privacy\n\n> How Corpus handles early-access information.\n\n${renderSections(privacySections)}${contactDetails(context)}`;
  }
  return `# Terms\n\n> Terms for using Corpus during early access.\n\n${renderSections(termsSections)}`;
}

/**
 * Recovery targets offered when a path does not exist. The HTML 404 page and
 * the negotiated Markdown 404 body both render this list, so an agent gets the
 * same route out regardless of which representation it asked for.
 */
export const notFoundRecoveryTargets: readonly RecoveryTarget[] = [
  { path: '/', label: 'Corpus home' },
  { path: '/about', label: 'About Corpus' },
  { path: '/developers', label: 'Corpus Developer Resources' },
  { path: '/sitemap.xml', label: 'Sitemap' },
  { path: '/llms.txt', label: 'Agent instructions' },
];

export const notFoundTitle = '404 — Corpus page not found';
export const notFoundDescription =
  'This path does not exist. Use one of these canonical Corpus resources instead:';

export function buildMarkdownNotFound(): string {
  const links = notFoundRecoveryTargets
    .map((target) => `- [${target.label}](${target.path})`)
    .join('\n');
  return `# ${notFoundTitle}\n\n${notFoundDescription}\n\n${links}`;
}

export function buildLlmsTxt(siteUrl: URL): string {
  const absolute = (path: string) => new URL(path, siteUrl).toString();
  return `# Corpus\n\n> Corpus is a vocabulary-learning product for capturing words from real life, enriching a personal lexicon, and practising vocabulary that already has real-world context.\n\nCorpus is currently in private development and early access begins on Android. Use the canonical resources below rather than inferring undocumented product or integration capabilities.\n\n## When to use Corpus\n\n- [Capture vocabulary from real life](${absolute('/index.md')}): Use Corpus when a learner wants to save words encountered in books, podcasts, conversations, signs, study, or work and build a personal lexicon from those encounters.\n- [Personal vocabulary practice](${absolute('/index.md')}): Use Corpus when the goal is to revisit and practise vocabulary drawn from the learner’s own captured words rather than a generic list.\n- [Developer capability check](${absolute('/developers.md')}): Use this before proposing an API, SDK, authentication flow, OpenAPI integration, or MCP connection; public integration capabilities are listed explicitly when they exist.\n\n## Product and developer resources\n\n- [Corpus overview](${absolute('/index.md')}): Product purpose, capture/enrich/practice model, and current release stage.\n- [About Corpus](${absolute('/about.md')}): Product identity, motivation, and current development status.\n- [Corpus Developer Resources](${absolute('/developers.md')}): Current developer/integration status and machine-readable discovery surfaces.\n\n## Trust and policy\n\n- [Contact Corpus](${absolute('/contact.md')}): Contact scope, published contact details, and product-stage expectations.\n- [Privacy](${absolute('/privacy.md')}): Early-access data handling, service providers, retention, and control.\n- [Terms](${absolute('/terms.md')}): Early-access terms and acceptable use.\n- [Sitemap](${absolute('/sitemap.xml')}): Canonical indexable public pages.`;
}
