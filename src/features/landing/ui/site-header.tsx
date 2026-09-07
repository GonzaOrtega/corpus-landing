import Link from 'next/link';
import type { ReleaseStage } from '../../../config/release-stage';
import { landingContent } from '../content/landing-content';
import { CorpusMark } from './corpus-mark';
import { ReleaseCta } from './release-cta';

interface SiteHeaderProps {
  releaseStage: ReleaseStage;
  downloadUrl?: URL | null;
}

export function SiteHeader({ releaseStage, downloadUrl = null }: SiteHeaderProps) {
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
          <ReleaseCta className="button" downloadUrl={downloadUrl} releaseStage={releaseStage} />
        </nav>
      </div>
    </header>
  );
}
