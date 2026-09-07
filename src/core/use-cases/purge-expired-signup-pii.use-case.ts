import { EarlyAccessSignup } from '../entities/early-access-signup';
import type { EarlyAccessSignupRepository } from '../repositories/early-access-signup.repository';

export interface PiiPurgeResult {
  unsubscribedAnonymized: number;
  launchedAnonymized: number;
}

export class PurgeExpiredSignupPiiUseCase {
  constructor(private readonly repository: EarlyAccessSignupRepository) {}

  async execute(at: Date, limit: number): Promise<PiiPurgeResult> {
    const due = await this.repository.findPiiPurgeDue(at, limit);
    let unsubscribedAnonymized = 0;
    let launchedAnonymized = 0;

    for (const signup of due) {
      const props = signup.toProps();
      if (props.launchSentAt !== null) launchedAnonymized += 1;
      else if (props.unsubscribedAt !== null) unsubscribedAnonymized += 1;

      await this.repository.save(
        EarlyAccessSignup.fromProps({
          ...props,
          emailOriginal: null,
          emailNormalized: null,
          manageTokenHash: null,
          anonymizedAt: at,
          updatedAt: at,
        }),
      );
    }

    return { unsubscribedAnonymized, launchedAnonymized };
  }
}
