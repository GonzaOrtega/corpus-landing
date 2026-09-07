import type { NewEarlyAccessSignup } from '../../core/entities/early-access-signup';
import {
  EarlyAccessSignup,
  type EarlyAccessSignupProps,
} from '../../core/entities/early-access-signup';
import type { earlyAccessSignups } from './schema';

type Row = typeof earlyAccessSignups.$inferSelect;
type InsertValues = typeof earlyAccessSignups.$inferInsert;

export function rowToEntity(row: Row): EarlyAccessSignup {
  return EarlyAccessSignup.fromProps(row);
}

/** Fresh-row lifecycle defaults mirror InMemoryEarlyAccessSignupRepository.create — §9.1. */
export function toInsertValues(input: NewEarlyAccessSignup): InsertValues {
  return {
    emailOriginal: input.emailOriginal,
    emailNormalized: input.emailNormalized,
    consentVersion: input.consentVersion,
    consentedAt: input.consentedAt,
    createdAt: input.consentedAt,
    updatedAt: input.consentedAt,
    manageTokenHash: input.manageTokenHash,
    unsubscribedAt: null,
    anonymizedAt: null,
    confirmationStatus: 'pending',
    confirmationAttemptCount: 0,
    confirmationLastAttemptAt: null,
    confirmationNextAttemptAt: null,
    confirmationSentAt: null,
    launchStatus: 'pending',
    launchAttemptCount: 0,
    launchLastAttemptAt: null,
    launchSentAt: null,
  };
}

/** save() persists exactly the given entity's props — callers own every field, including updatedAt. */
export function toUpdateValues(props: EarlyAccessSignupProps): Omit<InsertValues, 'id'> {
  const { id: _id, ...rest } = props;
  return rest;
}
