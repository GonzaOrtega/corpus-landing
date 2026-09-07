/**
 * Repo-controlled strings reach terminals and CI logs through evidence output.
 * ANSI/OSC injection through exactly this path shipped as a real bug in Codex CLI
 * (Feb 2026) and the vercel-labs `skills` CLI. Inlined rather than depending on
 * `strip-ansi` because these files are vendored verbatim into other repos, where a
 * runtime dependency would not resolve.
 *
 * Regex is ansi-regex@6.2.2 (MIT, Sindre Sorhus), reproduced verbatim. It covers
 * CSI and OSC — including OSC 8 hyperlinks — but by design does NOT cover bare C0/C1
 * controls or Unicode bidi overrides, which are not ANSI escapes. Those are stripped
 * separately below; bidi overrides are the Trojan Source class (USENIX Security 2021),
 * where rendered text differs from the underlying bytes.
 */
function ansiRegex(): RegExp {
  const ST = '(?:\\u0007|\\u001B\\u005C|\\u009C)'
  const osc = `(?:\\u001B\\][\\s\\S]*?${ST})`
  const csi = '[\\u001B\\u009B][[\\]()#;?]*(?:\\d{1,4}(?:[;:]\\d{0,4})*)?[\\dA-PR-TZcf-nq-uy=><~]'
  return new RegExp(`${osc}|${csi}`, 'g')
}

const ANSI = ansiRegex()
const C0_C1 = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g
const BIDI = /[\u202A-\u202E\u2066-\u2069]/g

export function sanitizeForTerminal(input: string): string {
  return input.replace(ANSI, '').replace(C0_C1, '').replace(BIDI, '')
}

/**
 * Sanitize THEN truncate — never the reverse. The OSC branch only matches when it
 * finds its terminator, so cutting mid-sequence leaves an unterminated
 * `ESC]8;;https://…` in the output that no later strip will match.
 */
export function truncate(input: string, maxChars: number): string {
  const clean = sanitizeForTerminal(input)
  const chars = Array.from(clean) // code-point aware: will not split a surrogate pair
  return chars.length <= maxChars ? clean : `${chars.slice(0, maxChars).join('')}…`
}
