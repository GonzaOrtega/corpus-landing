import { randomUUID } from 'node:crypto';
import { EarlyAccessSignup, type NewEarlyAccessSignup } from '../entities/early-access-signup';
import { PersistenceConflictError } from '../errors/early-access-errors';
import type { EarlyAccessSignupRepository } from '../repositories/early-access-signup.repository';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * §9.2 — mirrors PostgreSQL's partial unique index (current, non-anonymized
 * rows only) so a test exercising this repository proves the same invariant
 * the real Drizzle adapter's index enforces.
 */
export class InMemoryEarlyAccessSignupRepository implements EarlyAccessSignupRepository {
  private readonly rows = new Map<string, EarlyAccessSignup>();

  async findCurrentByNormalizedEmail(emailNormalized: string): Promise<EarlyAccessSignup | null> {
    for (const row of this.rows.values()) {
      const props = row.toProps();
      if (props.emailNormalized === emailNormalized && props.anonymizedAt === null) {
        return row;
      }
    }
    return null;
  }

  async findByManageTokenHash(hash: string): Promise<EarlyAccessSignup | null> {
    for (const row of this.rows.values()) {
      if (row.toProps().manageTokenHash === hash) return row;
    }
    return null;
  }

  async findById(id: string): Promise<EarlyAccessSignup | null> {
    return this.rows.get(id) ?? null;
  }

  async create(input: NewEarlyAccessSignup): Promise<EarlyAccessSignup> {
    this.assertNoActiveDuplicate(input.emailNormalized, null);
    const signup = EarlyAccessSignup.fromProps({
      id: randomUUID(),
      emailOriginal: input.emailOriginal,
      emailNormalized: input.emailNormalized,
      consentVersion: input.consentVersion,
      consentedAt: input.consentedAt,
      createdAt: input.consentedAt,
      updatedAt: input.consentedAt,
      unsubscribedAt: null,
      anonymizedAt: null,
      manageTokenHash: input.manageTokenHash,
      confirmationStatus: 'pending',
      confirmationAttemptCount: 0,
      confirmationLastAttemptAt: null,
      confirmationNextAttemptAt: null,
      confirmationSentAt: null,
      launchStatus: 'pending',
      launchAttemptCount: 0,
      launchLastAttemptAt: null,
      launchSentAt: null,
    });
    this.rows.set(signup.id, signup);
    return signup;
  }

  async save(signup: EarlyAccessSignup): Promise<EarlyAccessSignup> {
    const props = signup.toProps();
    this.assertNoActiveDuplicate(props.emailNormalized, props.id);
    this.rows.set(props.id, signup);
    return signup;
  }

  async findConfirmationsDue(at: Date, limit: number): Promise<EarlyAccessSignup[]> {
    return [...this.rows.values()]
      .filter((row) => {
        const p = row.toProps();
        return (
          p.anonymizedAt === null &&
          p.confirmationStatus === 'failed' &&
          p.confirmationNextAttemptAt !== null &&
          p.confirmationNextAttemptAt.getTime() <= at.getTime()
        );
      })
      .slice(0, limit);
  }

  async findLaunchEligible(limit: number, afterId?: string): Promise<EarlyAccessSignup[]> {
    const eligible = [...this.rows.values()]
      .filter((row) => row.isLaunchEligible())
      .sort((a, b) => a.id.localeCompare(b.id));
    const startIndex = afterId ? eligible.findIndex((row) => row.id === afterId) + 1 : 0;
    return eligible.slice(startIndex, startIndex + limit);
  }

  async findPiiPurgeDue(at: Date, limit: number): Promise<EarlyAccessSignup[]> {
    const isDue = (timestamp: Date | null) =>
      timestamp !== null && at.getTime() - timestamp.getTime() >= THIRTY_DAYS_MS;

    return [...this.rows.values()]
      .filter((row) => {
        const p = row.toProps();
        return p.anonymizedAt === null && (isDue(p.launchSentAt) || isDue(p.unsubscribedAt));
      })
      .slice(0, limit);
  }

  async countLaunchEligible(): Promise<number> {
    return [...this.rows.values()].filter((row) => row.isLaunchEligible()).length;
  }

  private assertNoActiveDuplicate(emailNormalized: string | null, excludeId: string | null): void {
    // A null email (already anonymized) can never collide with anything.
    if (emailNormalized === null) return;
    for (const row of this.rows.values()) {
      const props = row.toProps();
      if (
        props.id !== excludeId &&
        props.emailNormalized === emailNormalized &&
        props.anonymizedAt === null
      ) {
        throw new PersistenceConflictError();
      }
    }
  }
}
