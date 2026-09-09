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
        <nav aria-label="Site information" className="footer-links">
          <Link href="/about">About</Link>
          <Link href="/contact">Contact</Link>
          <Link href="/developers">Developers</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </nav>
        <p className="footer-copyright">© 2026 Corpus</p>
      </div>
    </footer>
  );
}
