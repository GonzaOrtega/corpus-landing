import { describe, expect, it } from 'vitest';
import type { NewEarlyAccessSignup } from '../../core/entities/early-access-signup';
import { buildSignupProps } from '../../core/testing/early-access-signup.factory';
import { InMemoryEarlyAccessSignupRepository } from '../../core/testing/in-memory-early-access-signup.repository';
import { rowToEntity, toInsertValues, toUpdateValues } from './early-access-signup.mapper';

const input: NewEarlyAccessSignup = {
  emailOriginal: 'Person@Example.com',
  emailNormalized: 'person@example.com',
  consentVersion: '2026-09-06',
  consentedAt: new Date('2026-09-07T12:00:00.000Z'),
  manageTokenHash: 'hash:token',
};

describe('early-access signup mapper', () => {
  it('gives a fresh row exactly the lifecycle defaults the in-memory repository uses — §9.1', async () => {
    const { id: _id, ...inMemoryDefaults } = (
      await new InMemoryEarlyAccessSignupRepository().create(input)
    ).toProps();

    expect(toInsertValues(input)).toEqual(inMemoryDefaults);
  });

  it('stamps created and updated with the consent time so the first row is self-consistent', () => {
    const values = toInsertValues(input);

    expect(values.createdAt).toEqual(input.consentedAt);
    expect(values.updatedAt).toEqual(input.consentedAt);
    expect(values).toMatchObject({ confirmationStatus: 'pending', launchStatus: 'pending' });
  });

  it('never lets save() rewrite the primary key but persists every other prop verbatim', () => {
    const props = buildSignupProps({ launchStatus: 'sent', launchAttemptCount: 2 });
    const { id: _id, ...expected } = props;

    const values = toUpdateValues(props);

    expect(values).not.toHaveProperty('id');
    expect(values).toEqual(expected);
  });

  it('round-trips a row through the entity without loss', () => {
    const row = buildSignupProps({ confirmationStatus: 'exhausted', confirmationAttemptCount: 3 });

    const entity = rowToEntity(row);

    expect(entity.id).toBe(row.id);
    expect(entity.toProps()).toEqual(row);
  });
});
