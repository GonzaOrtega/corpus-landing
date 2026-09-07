export const landingContent = {
  navigation: [
    { href: '#how', label: 'How it works' },
    { href: '#lexicon', label: 'Lexicon' },
  ],
  hero: {
    eyebrow: 'A vocabulary you actually met',
    heading: 'Learn words from real life.',
    lede: "You notice a word — in a book, in a podcast, on a sign in the street. Capture it in a second. Corpus fills in what it means and brings it back until it's yours.",
    note: "Corpus is in private development. There's no App Store or Play Store listing yet — early access begins on Android.",
  },
  stages: [
    [
      'Capture',
      'Type it and move on.',
      'One word is the whole requirement. Context, source and category are optional, and capture never waits for the network — or for anything to be looked up.',
    ],
    [
      'Enrich',
      'The entry fills itself in.',
      "Definition, pronunciation, examples, and the kind of detail you'd otherwise go looking for. It happens in the background, after you've already moved on.",
    ],
    [
      'Practice',
      'Five words, most days.',
      'Drawn from your own lexicon. Short enough to do standing up, and often enough that a word moves from recognised to used.',
    ],
  ] as const,
} as const;
