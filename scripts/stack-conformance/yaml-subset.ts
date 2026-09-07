/**
 * A YAML subset parser for Docker Compose files, vendored with no imports at all
 * (not even `node:*`) so the copy in `scripts/stack-conformance/` stays portable
 * under plain `node`, with no install step.
 *
 * `Bun.YAML.parse` cannot be used here: it is Bun-only, files under
 * `stack/skills/` run under plain `node` elsewhere, and this repo's own Vitest
 * workers have no `Bun` global either — so the call throws `ReferenceError`
 * silently inside whatever try/catch calls it, and every compose file reads
 * as unparseable.
 *
 * Scope is only what compose files here actually use: nested maps, block and
 * flow lists, inline flow maps, quote-respecting scalars (with escapes
 * decoded), and block scalars (`|`/`>`). Anchors, aliases, merge keys
 * (`<<`), multi-document streams, tags (`!...`), and complex keys are NOT
 * implemented — meeting one throws, because a loud "unparseable compose" is
 * correct and a silent wrong value is not.
 *
 * Block scalar CAPTURE is deliberately relaxed: no check in this project
 * reads a block scalar's body (no check inspects `entrypoint`/`command`/
 * `test` string contents), so the bar is "produce a plausible string and
 * keep parsing the rest of the document," not byte-fidelity with a
 * reference implementation. Literal (`|`) keeps line breaks; folded (`>`)
 * joins lines with spaces and turns blank lines into paragraph breaks.
 */

type Line = { indent: number; content: string; lineNo: number }

export function parseYaml(source: string): unknown {
  const lines = tokenize(source)
  if (lines.length === 0) return {}
  const rootIndent = lines[0]!.indent
  const [doc, next] = startsWithDash(lines[0]!.content)
    ? parseBlockList(lines, 0, rootIndent)
    : parseBlockMap(lines, 0, rootIndent)
  if (next !== lines.length) {
    throw new Error(`inconsistent indentation at: ${lines[next]!.content}`)
  }
  return doc
}

function tokenize(source: string): Line[] {
  const lines: Line[] = []
  let sawContent = false
  const rawLines = source.replace(/\r\n/g, '\n').split('\n')
  for (let lineNo = 0; lineNo < rawLines.length; lineNo++) {
    const raw = rawLines[lineNo]!
    if (/^---(\s|$)/.test(raw)) {
      // A LEADING "---" is just a document-start marker (common header); only
      // one appearing after real content opens a second document.
      if (sawContent) throw new Error('multi-document streams ("---") are not supported')
      sawContent = true
      continue
    }
    if (/^\s*#/.test(raw) || /^\s*$/.test(raw)) continue
    const leading = raw.match(/^[ \t]*/)![0]
    if (leading.includes('\t')) throw new Error(`tabs are not supported in indentation: ${raw}`)
    lines.push({ indent: leading.length, content: raw.slice(leading.length), lineNo })
    sawContent = true
  }
  return lines
}

function startsWithDash(content: string): boolean {
  return content === '-' || content.startsWith('- ')
}

function parseBlockMap(lines: Line[], start: number, indent: number): [Record<string, unknown>, number] {
  const result: Record<string, unknown> = {}
  let i = start
  while (i < lines.length && lines[i]!.indent === indent && !startsWithDash(lines[i]!.content)) {
    const [key, value, next] = parseMapEntry(lines[i]!.content, indent, lines, i + 1, lines[i]!.lineNo)
    result[key] = value
    i = next
  }
  return [result, i]
}

function parseBlockList(lines: Line[], start: number, indent: number): [unknown[], number] {
  const result: unknown[] = []
  let i = start
  while (i < lines.length && lines[i]!.indent === indent && startsWithDash(lines[i]!.content)) {
    const [item, next] = parseListItem(lines[i]!.content, indent, lines, i + 1, lines[i]!.lineNo)
    result.push(item)
    i = next
  }
  return [result, i]
}

function parseListItem(
  content: string,
  indent: number,
  lines: Line[],
  afterIdx: number,
  lineNo: number,
): [unknown, number] {
  const afterDash = content.slice(1)
  if (afterDash.trim() === '') return parseNestedBlock(lines, afterIdx, indent)

  const leadingSpaces = afterDash.length - afterDash.trimStart().length
  const itemIndent = indent + 1 + leadingSpaces
  const itemText = stripComment(afterDash.trim())
  if (itemText === '') return [null, afterIdx]

  const header = parseBlockHeader(itemText)
  // The reference indent is the "-" itself, not the value's own column
  // (itemIndent) — content just needs to out-indent the dash, mirroring how
  // a map entry's block scalar only needs to out-indent its key.
  if (header) return readBlockScalar(lines, afterIdx, indent, header, lineNo)

  if (startsWithDash(itemText)) {
    // Inline nested sequence, e.g. "- - x": the rest of this line is itself
    // a list item, and further "-" lines at itemIndent are its siblings.
    const [first, next] = parseListItem(itemText, itemIndent, lines, afterIdx, lineNo)
    const [rest, finalI] = parseBlockList(lines, next, itemIndent)
    return [[first, ...rest], finalI]
  }

  const colonIdx = findTopLevelColon(itemText)
  if (colonIdx !== -1) {
    const [key, value, next] = parseMapEntry(itemText, itemIndent, lines, afterIdx, lineNo)
    const [rest, finalI] = parseBlockMap(lines, next, itemIndent)
    return [{ [key]: value, ...rest }, finalI]
  }
  return [parseScalarOrFlow(itemText), afterIdx]
}

/** Shared by a `key:` with no inline value and a `-` with no inline item. */
function parseNestedBlock(lines: Line[], i: number, parentIndent: number): [unknown, number] {
  if (i < lines.length && lines[i]!.indent > parentIndent) {
    const childIndent = lines[i]!.indent
    return startsWithDash(lines[i]!.content)
      ? parseBlockList(lines, i, childIndent)
      : parseBlockMap(lines, i, childIndent)
  }
  return [null, i]
}

type BlockHeader = { style: '|' | '>'; chomping: 'clip' | 'strip' | 'keep'; indent: number | null }

/** `|`, `>`, plus an optional chomping indicator and/or explicit indentation indicator, in either order. */
function parseBlockHeader(raw: string): BlockHeader | null {
  const m = /^([|>])([+-]?)(\d?)([+-]?)$/.exec(raw)
  if (!m) return null
  const sign = m[2] || m[4] || ''
  return {
    style: m[1] as '|' | '>',
    chomping: sign === '-' ? 'strip' : sign === '+' ? 'keep' : 'clip',
    indent: m[3] ? Number(m[3]) : null,
  }
}

/**
 * Consumes the block scalar's body from `lines`, starting at `start`, using
 * `lineNo` gaps (lines dropped as blank/comment by `tokenize`) as a proxy for
 * blank lines in the original source — an approximation, not byte-fidelity;
 * see the file header.
 */
function readBlockScalar(
  lines: Line[],
  start: number,
  parentIndent: number,
  header: BlockHeader,
  headerLineNo: number,
): [string, number] {
  let i = start
  let contentIndent = header.indent !== null ? parentIndent + header.indent : -1
  let prevLineNo = headerLineNo
  const raw: string[] = []
  while (i < lines.length && lines[i]!.indent > parentIndent) {
    if (contentIndent === -1) contentIndent = lines[i]!.indent
    if (lines[i]!.indent < contentIndent) break
    for (let gap = lines[i]!.lineNo - prevLineNo; gap > 1; gap--) raw.push('')
    raw.push(' '.repeat(lines[i]!.indent - contentIndent) + lines[i]!.content)
    prevLineNo = lines[i]!.lineNo
    i++
  }
  const body = header.style === '|' ? raw.join('\n') : foldLines(raw)
  return [applyChomping(body, header.chomping), i]
}

function foldLines(raw: string[]): string {
  const paragraphs: string[] = []
  let paragraph: string[] = []
  for (const line of raw) {
    if (line === '') {
      if (paragraph.length) paragraphs.push(paragraph.join(' '))
      paragraph = []
      paragraphs.push('')
    } else {
      paragraph.push(line)
    }
  }
  if (paragraph.length) paragraphs.push(paragraph.join(' '))
  return paragraphs.join('\n')
}

function applyChomping(body: string, chomping: BlockHeader['chomping']): string {
  if (chomping === 'strip' || body === '') return body
  return body + '\n'
}

function parseMapEntry(
  content: string,
  indent: number,
  lines: Line[],
  afterIdx: number,
  lineNo: number,
): [string, unknown, number] {
  const colonIdx = findTopLevelColon(content)
  if (colonIdx === -1) throw new Error(`expected "key: value" at: ${content}`)
  const key = content.slice(0, colonIdx).trim()
  if (key === '<<') throw new Error(`YAML merge keys ("<<") are not supported: ${content}`)
  const rawValue = content.slice(colonIdx + 1).trim()
  if (rawValue === '') {
    // A block sequence value may sit at the SAME indent as its key — a
    // well-known YAML quirk that "key:\n- a\n- b" is valid and distinct
    // from a plain nested block, which requires strictly greater indent.
    if (afterIdx < lines.length && lines[afterIdx]!.indent === indent && startsWithDash(lines[afterIdx]!.content)) {
      const [value, next] = parseBlockList(lines, afterIdx, indent)
      return [key, value, next]
    }
    const [value, next] = parseNestedBlock(lines, afterIdx, indent)
    return [key, value, next]
  }
  const header = parseBlockHeader(stripComment(rawValue))
  if (header) {
    const [value, next] = readBlockScalar(lines, afterIdx, indent, header, lineNo)
    return [key, value, next]
  }
  return [key, parseScalarOrFlow(rawValue), afterIdx]
}

function parseScalarOrFlow(raw: string): unknown {
  checkUnsupportedValue(raw)
  if (raw[0] === "'" || raw[0] === '"') {
    const { value, end } = readQuoted(raw, 0)
    assertFullyConsumed(raw, end)
    return value
  }
  if (raw[0] === '[' || raw[0] === '{') {
    const [value, end] = parseFlowValue(raw, 0)
    assertFullyConsumed(raw, end)
    return value
  }
  return coerceScalar(stripComment(raw))
}

function checkUnsupportedValue(raw: string): void {
  if (/^[|>][-+]?\d*$/.test(raw)) throw new Error(`block scalars ("|"/">") are not supported: ${raw}`)
  if (raw[0] === '&') throw new Error(`YAML anchors are not supported: ${raw}`)
  if (raw[0] === '*') throw new Error(`YAML aliases are not supported: ${raw}`)
  if (raw[0] === '!') throw new Error(`YAML tags are not supported: ${raw}`)
}

function stripComment(raw: string): string {
  const idx = raw.search(/\s#/)
  return idx === -1 ? raw : raw.slice(0, idx).trimEnd()
}

/** After consuming a quoted/flow value up to `end`, only trailing whitespace/comment may remain. */
function assertFullyConsumed(raw: string, end: number): void {
  if (stripComment(raw.slice(end)).trim() !== '') {
    throw new Error(`unexpected trailing content: ${raw}`)
  }
}

function coerceScalar(raw: string): unknown {
  if (raw === 'true') return true
  if (raw === 'false') return false
  if (raw === 'null' || raw === '~') return null
  if (/^-?\d+$/.test(raw) || /^-?\d+\.\d+$/.test(raw)) return Number(raw)
  return raw
}

/** Finds the ':' that ends a map key: followed by a space or end-of-string, outside quotes. */
function findTopLevelColon(s: string): number {
  let i = 0
  while (i < s.length) {
    const ch = s[i]
    if (ch === "'" || ch === '"') {
      i = skipQuoted(s, i)
      continue
    }
    if (ch === ':' && (i === s.length - 1 || s[i + 1] === ' ')) return i
    i++
  }
  return -1
}

/** s[i] is the opening quote; returns the index right after the matching closing quote. */
function skipQuoted(s: string, i: number): number {
  const quote = s[i]
  i++
  while (i < s.length) {
    if (quote === '"' && s[i] === '\\') {
      i += 2
      continue
    }
    if (s[i] === quote) {
      if (quote === "'" && s[i + 1] === "'") {
        i += 2
        continue
      }
      return i + 1
    }
    i++
  }
  throw new Error(`unterminated quoted string: ${s}`)
}

function readQuoted(s: string, i: number): { value: string; end: number } {
  const quote = s[i]!
  const end = skipQuoted(s, i)
  return { value: decodeQuoted(s.slice(i + 1, end - 1), quote), end }
}

const DOUBLE_QUOTE_ESCAPES: Record<string, string> = {
  '"': '"',
  '\\': '\\',
  n: '\n',
  t: '\t',
  r: '\r',
  '/': '/',
  '0': '\0',
}

/** Decodes escapes in the content between a quoted scalar's delimiters (delimiters excluded). */
function decodeQuoted(content: string, quote: string): string {
  if (quote === "'") return content.replace(/''/g, "'")
  let out = ''
  for (let i = 0; i < content.length; i++) {
    const ch = content[i]!
    const next = content[i + 1]
    if (ch === '\\' && next !== undefined && next in DOUBLE_QUOTE_ESCAPES) {
      out += DOUBLE_QUOTE_ESCAPES[next]
      i++
    } else {
      out += ch
    }
  }
  return out
}

function skipWs(s: string, i: number): number {
  while (i < s.length && s[i] === ' ') i++
  return i
}

/** A small scanner for `[a, b]` / `{k: v}`, quote- and nesting-aware. */
function parseFlowValue(s: string, i: number): [unknown, number] {
  i = skipWs(s, i)
  const ch = s[i]
  if (ch === '[') return parseFlowArray(s, i)
  if (ch === '{') return parseFlowObject(s, i)
  if (ch === "'" || ch === '"') {
    const { value, end } = readQuoted(s, i)
    return [value, end]
  }
  let j = i
  while (j < s.length && s[j] !== ',' && s[j] !== ']' && s[j] !== '}') j++
  const raw = s.slice(i, j).trim()
  checkUnsupportedValue(raw)
  return [coerceScalar(raw), j]
}

function parseFlowArray(s: string, i: number): [unknown[], number] {
  const arr: unknown[] = []
  i = skipWs(s, i + 1)
  if (s[i] === ']') return [arr, i + 1]
  for (;;) {
    const [val, next] = parseFlowValue(s, i)
    arr.push(val)
    i = skipWs(s, next)
    if (s[i] === ',') {
      i = skipWs(s, i + 1)
      continue
    }
    if (s[i] === ']') return [arr, i + 1]
    throw new Error(`malformed flow list: ${s}`)
  }
}

function parseFlowObject(s: string, i: number): [Record<string, unknown>, number] {
  const obj: Record<string, unknown> = {}
  i = skipWs(s, i + 1)
  if (s[i] === '}') return [obj, i + 1]
  for (;;) {
    i = skipWs(s, i)
    let key: string
    if (s[i] === "'" || s[i] === '"') {
      const r = readQuoted(s, i)
      key = r.value
      i = r.end
    } else {
      let j = i
      while (j < s.length && s[j] !== ':') j++
      key = s.slice(i, j).trim()
      i = j
    }
    if (key === '<<') throw new Error(`YAML merge keys ("<<") are not supported: ${s}`)
    i = skipWs(s, i)
    if (s[i] !== ':') throw new Error(`expected ":" in flow map: ${s}`)
    i = skipWs(s, i + 1)
    const [val, next] = parseFlowValue(s, i)
    obj[key] = val
    i = skipWs(s, next)
    if (s[i] === ',') {
      i = skipWs(s, i + 1)
      continue
    }
    if (s[i] === '}') return [obj, i + 1]
    throw new Error(`malformed flow map: ${s}`)
  }
}
