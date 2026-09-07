import type { ReleaseStage } from '../../../config/release-stage';
import { CaptchaRejectedError, SignupClosedError } from '../../../core/errors/early-access-errors';
import type { CaptchaVerifier } from '../../../core/ports/captcha-verifier.port';
import type {
  JoinEarlyAccessOutput,
  JoinEarlyAccessUseCase,
} from '../../../core/use-cases/join-early-access.use-case';
import type { EarlyAccessBackend, EarlyAccessBackendInput } from './early-access-backend';

export type RequestConfirmation = (
  output: JoinEarlyAccessOutput & { managementToken: string },
) => Promise<void>;

export class LocalEarlyAccessBackend implements EarlyAccessBackend {
  constructor(
    private readonly releaseStage: ReleaseStage,
    private readonly captcha: CaptchaVerifier,
    private readonly joinUseCase: Pick<JoinEarlyAccessUseCase, 'execute'>,
    private readonly requestConfirmation: RequestConfirmation,
  ) {}

  async join(input: EarlyAccessBackendInput): Promise<void> {
    if (this.releaseStage !== 'early-access') throw new SignupClosedError();

    const captcha = await this.captcha.verify({
      token: input.captchaToken,
      action: 'early_access_signup',
    });
    if (!captcha.accepted) throw new CaptchaRejectedError();

    const result = await this.joinUseCase.execute({
      emailOriginal: input.emailOriginal,
      emailNormalized: input.emailNormalized,
      consentVersion: '2026-09-06',
    });
    if (result.shouldSendConfirmation && result.managementToken !== null) {
      await this.requestConfirmation({ ...result, managementToken: result.managementToken });
    }
  }
}
