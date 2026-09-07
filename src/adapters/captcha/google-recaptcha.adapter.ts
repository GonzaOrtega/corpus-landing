import { z } from 'zod';
import type {
  CaptchaVerificationRequest,
  CaptchaVerificationResult,
  CaptchaVerifier,
} from '../../core/ports/captcha-verifier.port';

const googleResponseSchema = z.object({
  success: z.boolean(),
  score: z.number(),
  action: z.string(),
  hostname: z.string(),
  challenge_ts: z.string().optional(),
  'error-codes': z.array(z.string()).optional(),
});

export type RecaptchaFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export class GoogleRecaptchaAdapter implements CaptchaVerifier {
  constructor(
    private readonly secretKey: string,
    private readonly threshold: number,
    private readonly expectedHostname: string,
    private readonly fetcher: RecaptchaFetch = fetch,
  ) {}

  async verify(request: CaptchaVerificationRequest): Promise<CaptchaVerificationResult> {
    try {
      const body = new URLSearchParams({ secret: this.secretKey, response: request.token });
      const response = await this.fetcher('https://www.google.com/recaptcha/api/siteverify', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
        cache: 'no-store',
      });
      if (!response.ok) return { accepted: false };

      const parsed = googleResponseSchema.safeParse(await response.json());
      if (!parsed.success) return { accepted: false };
      const value = parsed.data;
      return {
        accepted:
          value.success &&
          value.action === request.action &&
          value.score >= this.threshold &&
          value.hostname === this.expectedHostname,
      };
    } catch {
      return { accepted: false };
    }
  }
}
