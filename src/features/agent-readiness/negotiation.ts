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

/**
 * RFC 9110 §12.4.2: an unparseable or out-of-range weight is a malformed
 * parameter, and a recipient that cannot parse a parameter ignores it. Treating
 * it as q=0 would turn `Accept: text/html;q=high` into a 406.
 */
function parseQuality(value: string | undefined): number {
  // `Number('')` is 0, so an empty `q=` would silently read as a refusal.
  if (value === undefined || value.length === 0) return 1;
  const quality = Number(value);
  if (!Number.isFinite(quality) || quality < 0 || quality > 1) return 1;
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

function bestMatch(ranges: readonly MediaRange[], mediaType: string): MediaRange | undefined {
  return ranges
    .map((range) => ({ range, specificity: specificity(range, mediaType) }))
    .filter((match) => match.specificity >= 0)
    .sort(
      (left, right) => right.specificity - left.specificity || left.range.index - right.range.index,
    )[0]?.range;
}

function scoreCandidate(
  ranges: readonly MediaRange[],
  mediaType: string,
  representation: NegotiatedRepresentation,
  serverIndex: number,
): CandidateScore | null {
  const selected = bestMatch(ranges, mediaType);
  if (!selected || selected.quality <= 0) return null;

  return {
    representation,
    quality: selected.quality,
    acceptIndex: selected.index,
    serverIndex,
  };
}

/**
 * What to serve for a given `Accept` header.
 *
 * - `markdown` / `html` — serve that representation.
 * - `html-rejected` — the client matched `text/html` against a range weighted
 *   q=0, so it has explicitly refused HTML and 406 is the only honest answer.
 *
 * A header that simply never mentions HTML (`Accept: application/pdf`) is *not*
 * an explicit refusal: RFC 9110 §12.5.1 lets the origin disregard `Accept`
 * rather than fail, and returning HTML keeps naive clients and uptime monitors
 * working.
 */
export type AcceptDecision = NegotiatedRepresentation | 'html-rejected';

/**
 * Negotiates the two representations Corpus actually serves. Exact media
 * ranges override wildcards (including q=0 exclusions), client preference
 * wins next, and HTML is the stable server preference for ties / wildcard-only
 * browser requests.
 */
export function negotiateRepresentation(acceptHeader: string | null): AcceptDecision {
  if (!acceptHeader?.trim()) return 'html';
  const ranges = parseAcceptHeader(acceptHeader);
  if (ranges.length === 0) return 'html';

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

  const preferred = candidates[0]?.representation;
  if (preferred) return preferred;

  const htmlRange = bestMatch(ranges, 'text/html');
  return htmlRange && htmlRange.quality <= 0 ? 'html-rejected' : 'html';
}
