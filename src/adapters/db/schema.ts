import { sql } from 'drizzle-orm';
import { integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

/**
 * One table, per spec §9.1. No generic overall `status` column — current
 * subscription state is derived from the lifecycle facts below (§9.1), not
 * stored redundantly. This file is schema only: it produces the generated
 * migration under drizzle/. Repository mapping to/from `EarlyAccessSignup`
 * belongs to the adapter, not here (§9.3) — core never sees a Drizzle row.
 */

export const confirmationStatusEnum = pgEnum('confirmation_status', [
  'pending',
  'sent',
  'failed',
  'exhausted',
]);

export const launchStatusEnum = pgEnum('launch_status', [
  'pending',
  'sending',
  'sent',
  'failed',
  'manual_review',
]);

export const earlyAccessSignups = pgTable(
  'early_access_signups',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    emailOriginal: text('email_original'),
    emailNormalized: text('email_normalized'),

    consentVersion: text('consent_version').notNull(),
    consentedAt: timestamp('consented_at', { withTimezone: true }).notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),

    unsubscribedAt: timestamp('unsubscribed_at', { withTimezone: true }),
    anonymizedAt: timestamp('anonymized_at', { withTimezone: true }),

    manageTokenHash: text('manage_token_hash'),

    confirmationStatus: confirmationStatusEnum('confirmation_status').notNull().default('pending'),
    confirmationAttemptCount: integer('confirmation_attempt_count').notNull().default(0),
    confirmationLastAttemptAt: timestamp('confirmation_last_attempt_at', { withTimezone: true }),
    confirmationNextAttemptAt: timestamp('confirmation_next_attempt_at', { withTimezone: true }),
    confirmationSentAt: timestamp('confirmation_sent_at', { withTimezone: true }),

    launchStatus: launchStatusEnum('launch_status').notNull().default('pending'),
    launchAttemptCount: integer('launch_attempt_count').notNull().default(0),
    launchLastAttemptAt: timestamp('launch_last_attempt_at', { withTimezone: true }),
    launchSentAt: timestamp('launch_sent_at', { withTimezone: true }),
  },
  (table) => [
    // §9.2 — application handles idempotent join/resubscribe; this partial
    // unique index is the final race-condition guard. Anonymized historical
    // rows are excluded so a resubscribe after anonymization is never blocked
    // by its own prior (now-anonymized) row.
    uniqueIndex('early_access_signups_email_normalized_active_idx')
      .on(table.emailNormalized)
      .where(sql`${table.anonymizedAt} is null and ${table.emailNormalized} is not null`),
  ],
);
