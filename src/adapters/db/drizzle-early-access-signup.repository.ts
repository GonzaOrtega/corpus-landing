import { and, asc, count, eq, gt, isNotNull, isNull, lte, or } from 'drizzle-orm';
import type {
  EarlyAccessSignup,
  NewEarlyAccessSignup,
} from '../../core/entities/early-access-signup';
import { PersistenceConflictError } from '../../core/errors/early-access-errors';
import type { EarlyAccessSignupRepository } from '../../core/repositories/early-access-signup.repository';
import { rowToEntity, toInsertValues, toUpdateValues } from './early-access-signup.mapper';
import type { Database } from './neon-database.adapter';
import { earlyAccessSignups } from './schema';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/** Postgres SQLSTATE for a unique-violation — the partial index enforcing §9.2. */
const UNIQUE_VIOLATION_CODE = '23505';

function hasUniqueViolationCode(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === UNIQUE_VIOLATION_CODE
  );
}

/** drizzle-orm wraps the driver error in DrizzleQueryError; the Postgres code lives on `.cause`. */
function isUniqueViolation(error: unknown): boolean {
  if (hasUniqueViolationCode(error)) return true;
  return error instanceof Error && hasUniqueViolationCode(error.cause);
}

function sqlStateOf(error: unknown): string | undefined {
  if (hasUniqueViolationCode(error)) return UNIQUE_VIOLATION_CODE;
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  if (error instanceof Error && error.cause) return sqlStateOf(error.cause);
  return undefined;
}

/**
 * Any other driver error (DrizzleQueryError) carries the full parameterized
 * query and its params — plaintext emails, token hashes — in `.message`,
 * `.query`, and `.params`. Rethrowing it verbatim would leak that to
 * whatever ends up logging it upstream, so only a bare SQLSTATE code
 * survives the boundary.
 */
function sanitizeDatabaseError(error: unknown): Error {
  const code = sqlStateOf(error);
  return new Error(
    code ? `Database operation failed (code: ${code})` : 'Database operation failed',
  );
}

/**
 * §9.2 — the partial unique index is the final race-condition guard;
 * a concurrent insert/update that violates it surfaces here as Postgres
 * error 23505, translated to the technology-agnostic PersistenceConflictError.
 */
export class DrizzleEarlyAccessSignupRepository implements EarlyAccessSignupRepository {
  constructor(private readonly db: Database) {}

  async findCurrentByNormalizedEmail(emailNormalized: string): Promise<EarlyAccessSignup | null> {
    const [row] = await this.db
      .select()
      .from(earlyAccessSignups)
      .where(
        and(
          eq(earlyAccessSignups.emailNormalized, emailNormalized),
          isNull(earlyAccessSignups.anonymizedAt),
        ),
      )
      .limit(1);
    return row ? rowToEntity(row) : null;
  }

  async findByManageTokenHash(hash: string): Promise<EarlyAccessSignup | null> {
    const [row] = await this.db
      .select()
      .from(earlyAccessSignups)
      .where(eq(earlyAccessSignups.manageTokenHash, hash))
      .limit(1);
    return row ? rowToEntity(row) : null;
  }

  async findById(id: string): Promise<EarlyAccessSignup | null> {
    const [row] = await this.db
      .select()
      .from(earlyAccessSignups)
      .where(eq(earlyAccessSignups.id, id))
      .limit(1);
    return row ? rowToEntity(row) : null;
  }

  async create(input: NewEarlyAccessSignup): Promise<EarlyAccessSignup> {
    try {
      const [row] = await this.db
        .insert(earlyAccessSignups)
        .values(toInsertValues(input))
        .returning();
      if (!row) throw new Error('insert returned no row');
      return rowToEntity(row);
    } catch (error) {
      if (isUniqueViolation(error)) throw new PersistenceConflictError();
      throw sanitizeDatabaseError(error);
    }
  }

  async save(signup: EarlyAccessSignup): Promise<EarlyAccessSignup> {
    const props = signup.toProps();
    try {
      const [row] = await this.db
        .update(earlyAccessSignups)
        .set(toUpdateValues(props))
        .where(eq(earlyAccessSignups.id, props.id))
        .returning();
      if (!row) throw new Error(`no signup found with id ${props.id}`);
      return rowToEntity(row);
    } catch (error) {
      if (isUniqueViolation(error)) throw new PersistenceConflictError();
      throw sanitizeDatabaseError(error);
    }
  }

  async findConfirmationsDue(at: Date, limit: number): Promise<EarlyAccessSignup[]> {
    const rows = await this.db
      .select()
      .from(earlyAccessSignups)
      .where(
        and(
          isNull(earlyAccessSignups.anonymizedAt),
          eq(earlyAccessSignups.confirmationStatus, 'failed'),
          isNotNull(earlyAccessSignups.confirmationNextAttemptAt),
          lte(earlyAccessSignups.confirmationNextAttemptAt, at),
        ),
      )
      .limit(limit);
    return rows.map(rowToEntity);
  }

  async findLaunchEligible(limit: number, afterId?: string): Promise<EarlyAccessSignup[]> {
    const conditions = [
      isNull(earlyAccessSignups.anonymizedAt),
      isNull(earlyAccessSignups.unsubscribedAt),
    ];
    if (afterId) conditions.push(gt(earlyAccessSignups.id, afterId));

    const rows = await this.db
      .select()
      .from(earlyAccessSignups)
      .where(and(...conditions))
      .orderBy(asc(earlyAccessSignups.id))
      .limit(limit);
    return rows.map(rowToEntity);
  }

  async findPiiPurgeDue(at: Date, limit: number): Promise<EarlyAccessSignup[]> {
    const threshold = new Date(at.getTime() - THIRTY_DAYS_MS);
    const rows = await this.db
      .select()
      .from(earlyAccessSignups)
      .where(
        and(
          isNull(earlyAccessSignups.anonymizedAt),
          or(
            and(
              isNotNull(earlyAccessSignups.launchSentAt),
              lte(earlyAccessSignups.launchSentAt, threshold),
            ),
            and(
              isNotNull(earlyAccessSignups.unsubscribedAt),
              lte(earlyAccessSignups.unsubscribedAt, threshold),
            ),
          ),
        ),
      )
      .limit(limit);
    return rows.map(rowToEntity);
  }

  async countLaunchEligible(): Promise<number> {
    const [result] = await this.db
      .select({ value: count() })
      .from(earlyAccessSignups)
      .where(
        and(isNull(earlyAccessSignups.anonymizedAt), isNull(earlyAccessSignups.unsubscribedAt)),
      );
    return result?.value ?? 0;
  }
}
