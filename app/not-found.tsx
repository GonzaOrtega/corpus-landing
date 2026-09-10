import type { Metadata } from 'next';
import Link from 'next/link';
import {
  notFoundDescription,
  notFoundRecoveryTargets,
  notFoundTitle,
} from '@/src/features/agent-readiness/content';

export const metadata: Metadata = {
  title: notFoundTitle,
  description: notFoundDescription,
  robots: { index: false, follow: true },
};

/**
 * Next's built-in 404 is a bare status page with no links out, which leaves an
 * agent that lands on a dead path with nowhere to go. This renders the same
 * recovery targets the negotiated Markdown 404 offers, using the existing legal
 * page styling so no new visual design is introduced.
 */
export default function NotFound() {
  return (
    <main className="legal-page wrap">
      <Link className="legal-back" href="/">
        ← Corpus
      </Link>
      <p className="eyebrow">Corpus</p>
      <h1>{notFoundTitle}</h1>
      <p className="legal-description">{notFoundDescription}</p>
      <nav aria-label="Recovery links" className="recovery-links">
        <ul>
          {notFoundRecoveryTargets.map((target) => (
            <li key={target.path}>
              {/* Plain anchors: /sitemap.xml and /llms.txt are route handlers,
                  not router pages, so next/link navigation cannot resolve them. */}
              <a href={target.path}>{target.label}</a>
            </li>
          ))}
        </ul>
      </nav>
    </main>
  );
}
