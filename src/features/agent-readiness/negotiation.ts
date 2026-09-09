export type NegotiatedRepresentation = 'html' | 'markdown';

interface MediaRange {
  type: string;
  subtype: string;
  quality: number;
  index: number;
}

interface CandidateScore {
  representation: NegotiatedRepresentation;
  quality: number;
  acceptIndex: number;
  serverIndex: number;
}

const REPRESENTATIONS: readonly {
  representation: NegotiatedRepresentation;
  mediaType: string;
}[] = [
  { representation: 'html', mediaType: 'text/html' },
  { representation: 'markdown', mediaType: 'text/markdown' },
];

function parseQuality(value: string | undefined): number {
  if (value === undefined) return 1;
  const quality = Number(value);
  if (!Number.isFinite(quality) || quality < 0 || quality > 1) return 0;
  return quality;
}

function parseAcceptHeader(acceptHeader: string): MediaRange[] {
  return acceptHeader
    .split(',')
    .map((rawRange, index): MediaRange | null => {
      const [rawMediaType, ...rawParameters] = rawRange.split(';');
      const [type, subtype, ...extra] = rawMediaType.trim().toLowerCase().split('/');
      if (!type || !subtype || extra.length > 0) return null;

      let quality = 1;
      for (const rawParameter of rawParameters) {
        const [rawName, rawValue] = rawParameter.split('=', 2);
        if (rawName?.trim().toLowerCase() === 'q') {
          quality = parseQuality(rawValue?.trim());
          break;
        }
      }

      return { type, subtype, quality, index };
    })
    .filter((range): range is MediaRange => range !== null);
}

function specificity(range: MediaRange, mediaType: string): number {
  const [candidateType, candidateSubtype] = mediaType.split('/');
  if (range.type === '*' && range.subtype === '*') return 0;
  if (range.type === candidateType && range.subtype === '*') return 1;
  if (range.type === candidateType && range.subtype === candidateSubtype) return 2;
  return -1;
}

function scoreCandidate(
  ranges: readonly MediaRange[],
  mediaType: string,
  representation: NegotiatedRepresentation,
  serverIndex: number,
): CandidateScore | null {
  const matches = ranges
    .map((range) => ({ range, specificity: specificity(range, mediaType) }))
    .filter((match) => match.specificity >= 0)
    .sort(
      (left, right) => right.specificity - left.specificity || left.range.index - right.range.index,
    );
  const selected = matches[0]?.range;
  if (!selected || selected.quality <= 0) return null;

  return {
    representation,
    quality: selected.quality,
    acceptIndex: selected.index,
    serverIndex,
  };
}

/**
 * Negotiates the two representations Corpus actually serves. Exact media
 * ranges override wildcards (including q=0 exclusions), client preference
 * wins next, and HTML is the stable server preference for ties / wildcard-only
 * browser requests.
 */
export function negotiateRepresentation(
  acceptHeader: string | null,
): NegotiatedRepresentation | null {
  if (!acceptHeader?.trim()) return 'html';
  const ranges = parseAcceptHeader(acceptHeader);
  if (ranges.length === 0) return null;

  const candidates = REPRESENTATIONS.map((candidate, serverIndex) =>
    scoreCandidate(ranges, candidate.mediaType, candidate.representation, serverIndex),
  )
    .filter((candidate): candidate is CandidateScore => candidate !== null)
    .sort(
      (left, right) =>
        right.quality - left.quality ||
        left.acceptIndex - right.acceptIndex ||
        left.serverIndex - right.serverIndex,
    );

  return candidates[0]?.representation ?? null;
}
