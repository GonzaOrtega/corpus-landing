import Link from 'next/link';
import { CorpusMark } from './corpus-mark';

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="wrap footer-inner">
        <Link aria-label="Corpus, back to top" className="brand" href="#top">
          <CorpusMark />
          <span>Corpus</span>
        </Link>
        <nav aria-label="Legal" className="footer-links">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </nav>
        <p className="footer-copyright">© 2026 Corpus</p>
      </div>
    </footer>
  );
}
