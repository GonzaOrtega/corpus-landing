export interface DemoLexiconEncounter {
  label: string;
  detail: string;
  emphasis?: string;
  empty?: boolean;
}

export interface DemoLexiconEntry {
  word: string;
  partOfSpeech: string;
  pronunciation: string;
  definition: string;
  state: string;
  encounters: readonly DemoLexiconEncounter[];
}

export const demoLexicon = [
  {
    word: 'lucent',
    partOfSpeech: 'adjective',
    pronunciation: '/ˈluːs(ə)nt/',
    definition: 'Softly bright; glowing with, or reflecting, light.',
    state: 'Solid — comes back without effort',
    encounters: [
      { label: 'First encountered', detail: 'Heard in a podcast — ', emphasis: 'a lucent morning' },
      { label: 'Met again', detail: 'Read in a novel, chapter 4' },
      { label: 'Used by you', detail: 'In writing, 2 September' },
    ],
  },
  {
    word: 'petrichor',
    partOfSpeech: 'noun',
    pronunciation: '/ˈpɛtrɪkɔː/',
    definition: 'The earthy smell that rises when rain falls on dry ground.',
    state: 'Shaky — recognised, not yet reached for',
    encounters: [
      { label: 'First encountered', detail: 'Read in an article, 3 July' },
      { label: 'Met again', detail: 'Overheard on the street, 21 July' },
      { label: 'Used by you', detail: 'Not yet', empty: true },
    ],
  },
  {
    word: 'gloaming',
    partOfSpeech: 'noun',
    pronunciation: '/ˈɡləʊmɪŋ/',
    definition: 'Dusk; the last usable light of the day.',
    state: 'Solid — comes back without effort',
    encounters: [
      { label: 'First encountered', detail: 'A line in a song, 9 June' },
      { label: 'Met again', detail: 'Read in a novel, 28 June' },
      { label: 'Used by you', detail: 'In writing, 14 July' },
    ],
  },
  {
    word: 'brackish',
    partOfSpeech: 'adjective',
    pronunciation: '/ˈbrakɪʃ/',
    definition: 'Slightly salty, as where a river meets the sea.',
    state: 'Shaky — recognised, not yet reached for',
    encounters: [
      { label: 'First encountered', detail: 'Heard in a documentary, 2 May' },
      { label: 'Met again', detail: 'Read on a sign at the coast, 30 May' },
      { label: 'Used by you', detail: 'Not yet', empty: true },
    ],
  },
  {
    word: 'askance',
    partOfSpeech: 'adverb',
    pronunciation: '/əˈskans/',
    definition: 'With suspicion or disapproval; also, sideways.',
    state: 'New — met once, waiting for practice',
    encounters: [
      { label: 'First encountered', detail: 'Read in a short story, 26 August' },
      { label: 'Met again', detail: 'Not yet', empty: true },
      { label: 'Used by you', detail: 'Not yet', empty: true },
    ],
  },
  {
    word: 'quotidian',
    partOfSpeech: 'adjective',
    pronunciation: '/kwɒˈtɪdɪən/',
    definition: 'Daily; ordinary to the point of going unnoticed.',
    state: 'Solid — comes back without effort',
    encounters: [
      { label: 'First encountered', detail: 'Read in an essay, 11 April' },
      { label: 'Met again', detail: 'Heard in a lecture, 5 May' },
      { label: 'Used by you', detail: 'In conversation, 19 June' },
    ],
  },
  {
    word: 'lattice',
    partOfSpeech: 'noun',
    pronunciation: '/ˈlatɪs/',
    definition: 'A framework of crossed strips; any regular repeating structure.',
    state: 'Shaky — recognised, not yet reached for',
    encounters: [
      { label: 'First encountered', detail: 'Read in documentation at work, 17 March' },
      { label: 'Met again', detail: 'Seen on a garden gate, 2 August' },
      { label: 'Used by you', detail: 'Not yet', empty: true },
    ],
  },
  {
    word: 'fathom',
    partOfSpeech: 'verb',
    pronunciation: '/ˈfaðəm/',
    definition: 'To understand after some effort; to get to the bottom of.',
    state: 'Solid — comes back without effort',
    encounters: [
      { label: 'First encountered', detail: 'Heard in conversation, 8 February' },
      { label: 'Met again', detail: 'Read in a novel, 3 April' },
      { label: 'Used by you', detail: 'In writing, 27 May' },
    ],
  },
] as const satisfies readonly DemoLexiconEntry[];
