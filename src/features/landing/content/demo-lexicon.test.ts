import { describe, expect, it } from 'vitest';
import { type DemoLexiconEntry, demoLexicon } from './demo-lexicon';

const entries: readonly DemoLexiconEntry[] = demoLexicon;

describe('demo lexicon', () => {
  it('leads with the specimen word the Capture, Enrich and Practice demonstrations share', () => {
    expect(entries[0]?.word).toBe('lucent');
    expect(entries[0]?.encounters[0]?.emphasis).toBe('a lucent morning');
  });

  it('holds distinct words with complete dictionary fields', () => {
    expect(new Set(entries.map((entry) => entry.word)).size).toBe(entries.length);
    for (const entry of entries) {
      expect(entry.partOfSpeech.trim()).not.toBe('');
      expect(entry.pronunciation).toMatch(/^\/.+\/$/);
      expect(entry.definition.trim()).not.toBe('');
      expect(entry.state).toMatch(/^(Solid|Shaky|New) — /);
    }
  });

  it('tells the same three-step encounter history for every word', () => {
    for (const entry of entries) {
      expect(entry.encounters.map((encounter) => encounter.label)).toEqual([
        'First encountered',
        'Met again',
        'Used by you',
      ]);
      for (const encounter of entry.encounters) {
        if (encounter.empty) expect(encounter.detail).toBe('Not yet');
        else expect(encounter.detail.trim()).not.toBe('');
      }
    }
  });
});
