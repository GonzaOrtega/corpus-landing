import Link from 'next/link';
import { landingContent } from '../content/landing-content';
import { CorpusMark } from './corpus-mark';

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="wrap header-inner">
        <Link aria-label="Corpus, home" className="brand" href="#top">
          <CorpusMark />
          <span>Corpus</span>
        </Link>
        <nav aria-label="Primary" className="nav">
          {landingContent.navigation.map((item) => (
            <Link className="nav-link" href={item.href} key={item.href}>
              {item.label}
            </Link>
          ))}
          <Link className="button button-solid" href="#early-access">
            Join early access
          </Link>
        </nav>
      </div>
    </header>
  );
}
