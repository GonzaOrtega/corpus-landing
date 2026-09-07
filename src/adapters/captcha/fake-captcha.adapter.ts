import type { CaptchaVerifier } from '../../core/ports/captcha-verifier.port';

/** Deterministic, non-network CAPTCHA for local, CI, and preview environments. */
export class FakeCaptchaAdapter implements CaptchaVerifier {
  async verify(request: Parameters<CaptchaVerifier['verify']>[0]) {
    return { accepted: request.token === 'test-pass' };
  }
}
