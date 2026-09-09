import { z } from 'zod';
import type {
  CaptchaVerificationRequest,
  CaptchaVerificationResult,
  CaptchaVerifier,
} from '../../core/ports/captcha-verifier.port';

const googleAssessmentSchema = z.object({
  tokenProperties: z.object({
    valid: z.boolean(),
    hostname: z.string(),
    action: z.string(),
  }),
  riskAnalysis: z.object({
    score: z.number(),
  }),
});

export type RecaptchaFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export class GoogleRecaptchaAdapter implements CaptchaVerifier {
  constructor(
    private readonly apiKey: string,
    private readonly projectId: string,
    private readonly siteKey: string,
    private readonly threshold: number,
    private readonly expectedHostname: string,
    private readonly fetcher: RecaptchaFetch = fetch,
  ) {}

  async verify(request: CaptchaVerificationRequest): Promise<CaptchaVerificationResult> {
    try {
      const endpoint = new URL(
        `https://recaptchaenterprise.googleapis.com/v1/projects/${encodeURIComponent(this.projectId)}/assessments`,
      );
      endpoint.searchParams.set('key', this.apiKey);

      const response = await this.fetcher(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          event: {
            token: request.token,
            siteKey: this.siteKey,
            expectedAction: request.action,
          },
        }),
        cache: 'no-store',
      });
      if (!response.ok) return { accepted: false };

      const parsed = googleAssessmentSchema.safeParse(await response.json());
      if (!parsed.success) return { accepted: false };
      const value = parsed.data;
      return {
        accepted:
          value.tokenProperties.valid &&
          value.tokenProperties.action === request.action &&
          value.riskAnalysis.score >= this.threshold &&
          value.tokenProperties.hostname === this.expectedHostname,
      };
    } catch {
      return { accepted: false };
    }
  }
}
