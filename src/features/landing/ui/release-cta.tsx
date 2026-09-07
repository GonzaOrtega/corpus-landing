import Link from 'next/link';
import type { ReleaseStage } from '../../../config/release-stage';

interface ReleaseCtaProps {
  releaseStage: ReleaseStage;
  downloadUrl?: URL | null;
  className?: string;
  magnetic?: boolean;
}

/** A release-stage CTA can only use the download URL validated in server config. */
export function ReleaseCta({
  releaseStage,
  downloadUrl = null,
  className,
  magnetic = false,
}: ReleaseCtaProps) {
  if (releaseStage === 'launched') {
    if (!downloadUrl) throw new Error('A launched CTA requires a validated download URL');
    return (
      <Link
        className={className}
        data-magnetic={magnetic || undefined}
        href={downloadUrl.toString()}
      >
        Get Corpus
      </Link>
    );
  }

  return (
    <Link className={className} data-magnetic={magnetic || undefined} href="#early-access">
      Join early access
    </Link>
  );
}
