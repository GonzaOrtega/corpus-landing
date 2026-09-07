/**
 * §9.2 — application handles idempotent join/resubscribe; PostgreSQL's
 * partial unique index is the final race-condition guard. Any repository
 * (real or in-memory) reports a race on the same current-identifiable-email
 * uniqueness rule through this error, never through a technology-specific one.
 */
export class PersistenceConflictError extends Error {
  constructor(message = 'A conflicting record already exists for this identifier') {
    super(message);
    this.name = 'PersistenceConflictError';
  }
}
