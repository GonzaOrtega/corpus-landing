export type ConfirmationStatus = 'pending' | 'sent' | 'failed' | 'exhausted';
export type LaunchStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'manual_review';

export interface EarlyAccessSignupProps {
  id: string;
  emailOriginal: string | null;
  emailNormalized: string | null;
  consentVersion: string;
  consentedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  unsubscribedAt: Date | null;
  anonymizedAt: Date | null;
  manageTokenHash: string | null;
  confirmationStatus: ConfirmationStatus;
  confirmationAttemptCount: number;
  confirmationLastAttemptAt: Date | null;
  confirmationNextAttemptAt: Date | null;
  confirmationSentAt: Date | null;
  launchStatus: LaunchStatus;
  launchAttemptCount: number;
  launchLastAttemptAt: Date | null;
  launchSentAt: Date | null;
}

/** Repository `create()` input — the rest of a fresh row's fields are lifecycle defaults. */
export interface NewEarlyAccessSignup {
  emailOriginal: string;
  emailNormalized: string;
  consentVersion: string;
  consentedAt: Date;
  manageTokenHash: string;
}

/**
 * §9.1: no generic overall subscription `status` column — current state is
 * always derived from lifecycle facts below, never stored redundantly.
 */
export class EarlyAccessSignup {
  private constructor(private readonly props: EarlyAccessSignupProps) {}

  static fromProps(props: EarlyAccessSignupProps): EarlyAccessSignup {
    return new EarlyAccessSignup(props);
  }

  get id(): string {
    return this.props.id;
  }

  toProps(): EarlyAccessSignupProps {
    return { ...this.props };
  }

  /** §6.5 — anonymization nulls every identifying field; nothing links back to the person. */
  isIdentifiable(): boolean {
    return this.props.anonymizedAt === null;
  }

  /** §6.3 — unsubscribing removes launch eligibility immediately. */
  isLaunchEligible(): boolean {
    return this.isIdentifiable() && this.props.unsubscribedAt === null;
  }
}
