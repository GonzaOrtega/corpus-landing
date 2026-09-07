import type { ReleaseStage } from '../../../config/release-stage';
import { ReleaseCta } from '../../landing/ui/release-cta';
import { SignupForm } from './signup-form';

interface EarlyAccessSectionProps {
  releaseStage: ReleaseStage;
  downloadUrl?: URL | null;
  recaptchaSiteKey: string | null;
}

export function EarlyAccessSection({
  releaseStage,
  downloadUrl = null,
  recaptchaSiteKey,
}: EarlyAccessSectionProps) {
  const launched = releaseStage === 'launched';

  return (
    <section className="section early-access" id="early-access">
      <div className="wrap">
        <div className="column">
          <p className="eyebrow">{launched ? 'Corpus' : 'Early access'}</p>
          <h2>{launched ? 'Get Corpus.' : 'Be there for the first build.'}</h2>
          <p className="lede">
            {launched
              ? "Early access is open on Android. Here's what's in the first build — and what isn't."
              : "Corpus is still in private development. Leave your email and we'll let you know when there's a build worth trying."}
          </p>
          {launched ? (
            <div className="early-access-cta">
              <ReleaseCta
                className="button button-solid"
                downloadUrl={downloadUrl}
                magnetic
                releaseStage={releaseStage}
              />
            </div>
          ) : (
            <SignupForm recaptchaSiteKey={recaptchaSiteKey} />
          )}
        </div>
      </div>
    </section>
  );
}
