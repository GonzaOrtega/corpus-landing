import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNeonDatabase } from './neon-database.adapter';

describe('createNeonDatabase', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('binds Drizzle to the schema without opening a connection', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const db = createNeonDatabase('postgres://user:pass@host.example/db');

    expect(typeof db.select).toBe('function');
    expect(typeof db.insert).toBe('function');
    expect(typeof db.update).toBe('function');
    expect(db.query.earlyAccessSignups).toBeDefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([
    ['an empty string', ''],
    ['an unparseable value', 'not a url'],
    ['a non-Postgres scheme', 'mysql://user:pass@host.example/db'],
  ])('rejects %s at construction rather than on first query', (_label, connectionString) => {
    expect(() => createNeonDatabase(connectionString)).toThrow();
  });
});
