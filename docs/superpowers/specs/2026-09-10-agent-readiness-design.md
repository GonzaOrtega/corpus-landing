# Agent-readable representations of the public site

**Date:** 2026-09-10
**Status:** design proposed
**Scope:** the machine-readable surfaces of the public site — Markdown content
negotiation, `/llms.txt`, structured data, recoverable 404s, and the three
public information pages those surfaces describe
**Relates to:** `docs/superpowers/specs/2026-09-06-corpus-landing-design.md`
(the approved design spec; this document adds to it and reinterprets none of it)

## Problem

An agent-readiness audit of the deployed site scored it **72/100** and reported
five findings. Three are surfaces the site does not publish at all, and two are
consequences of not publishing them:

| Finding | Weight | Evidence |
|---|---|---|
| Agent-friendly 404s | Essential, partial | Dead paths return a real 404, but with no body an agent can act on |
| Markdown content negotiation | Essential, failed | `Accept: text/markdown` returned `text/html`; `Vary` did not list `Accept` |
| Developer resource discoverability | Recommended, failed | A search for Corpus developer resources found nothing relevant |
| Brand name discoverability | Recommended, failed | The canonical domain did not appear in a search for the brand |
| JSON-LD structured data | Recommended, failed | No structured data on the homepage |

The underlying gap is that the site publishes exactly one representation of
itself — HTML built for a human reader — and no machine-readable statement of
what Corpus is, what stage it is at, or what it does and does not offer to
integrators. Agents are left to infer all of it from marketing markup, and
inferring an API that does not exist is the specific failure mode this spec
exists to prevent.

## Decisions

### 1. Two representations, negotiated per request

Six public paths are negotiated: `/`, `/about`, `/contact`, `/developers`,
`/privacy`, `/terms`. Each serves HTML by default and Markdown when the client
asks for it, following the `Accept: text/markdown` convention (RFC 9110
negotiation, the RFC 7763 media type, the RFC 7764 `variant` parameter).

- Negotiation happens in `proxy.ts`, ahead of the App Router.
- Exact media ranges beat wildcards; q-values beat header order; HTML is the
  stable server preference for ties and for wildcard-only browser requests.
- Every negotiated path also has a permanent `.md` alias (`/about.md`,
  `/index.md` for the root) so a Markdown representation can be linked and
  cited directly.
- HTML responses on these paths advertise the alternate in both a `Link`
  header and a `<link rel="alternate" type="text/markdown">` tag.

**Both representations render the same source copy.** Legal text lives once, in
`src/features/legal/content.ts`, and is rendered as HTML by `LegalPage` and as
Markdown by the agent-readiness content module. A published legal document must
not be able to say two different things.

### 2. `Vary: Accept, Accept-Encoding` on everything negotiated

Any response whose body depends on `Accept` declares it. On Vercel this is
applied to the HTML variants through `routes` transforms in `vercel.json`,
because Next.js sets its own `Vary` for RSC and the two must be merged rather
than overwrite each other. The accepted cost is that the CDN cache key for
those six paths now includes `Accept`.

### 3. 406 is narrow, deliberately

`406 Not Acceptable` is returned only on a negotiated path, and only when the
client's `Accept` weights `text/html` at `q=0` — an explicit refusal.

An `Accept` that simply never mentions HTML (`application/json`,
`application/pdf`) is **not** treated as a refusal: RFC 9110 §12.5.1 permits an
origin to disregard `Accept` rather than fail, and uptime monitors, link
checkers and JSON-first clients are more common than clients that genuinely
cannot render HTML. Non-negotiated paths never return 406.

### 4. A dead path is recoverable in either representation

`app/not-found.tsx` and `buildMarkdownNotFound()` render the same list of
recovery targets — home, `/about`, `/developers`, `/sitemap.xml`, `/llms.txt` —
from one definition. The status is a real 404 in both cases; the app shell is
never returned with a 200.

### 5. `/llms.txt` states when to use Corpus, and when not to

`/llms.txt` follows the published format (H1, blockquote summary, prose, then
H2 sections of annotated links) and adds a **When to use Corpus** section
naming best-fit use cases. All links are absolute, because an agent resolves
`llms.txt` out of context.

### 6. `/developers` documents the absence of an integration contract

Corpus has no public API, SDK, authentication API, OpenAPI document, or MCP
server. `/developers` says so explicitly and lists the machine-readable
surfaces that *do* exist. This is a product decision, not an omission: an agent
that cannot find a stated capability boundary will invent one.

### 7. Structured data asserts identity, never fabricates facts

The homepage publishes an `Organization` + `WebSite` + `SoftwareApplication`
JSON-LD graph. `offers` reflects the real release stage (`PreOrder` in early
access, `InStock` once launched). Optional fields are emitted **only when the
underlying value is configured** — no placeholder postal address, no download
URL before one exists. A fabricated fact in structured data is worse than a
missing one, because it is machine-consumed without review.

## Non-goals

- No public API, SDK, or MCP server is introduced. `/developers` documents
  their absence.
- No visual redesign. The new pages reuse the existing legal-page shell.
- No change to signup, confirmation, management, or launch behaviour. The
  Proxy handles `GET`/`HEAD` only and never touches Server Actions.
- Brand-name search visibility is not solvable in this repository. It needs the
  canonical domain indexed, consistent listings, and inbound links.

## Verification

- Unit: `Accept` parsing and the explicit-refusal boundary, the structured-data
  graph across release stages, Markdown/HTML content parity, and the shape of
  the `vercel.json` `Vary` transform.
- E2E: negotiation, the `.md` aliases, both 404 representations, footer
  reachability of every public page, and `/llms.txt`.
- Preview: `@preview`-tagged tests assert the deployed `Vary` and `Link`
  headers, which is the only place the `vercel.json` transforms actually run.
- Production: `runAgentReadinessSmoke` re-checks every public agent surface
  after a promote, using safe GETs only.
