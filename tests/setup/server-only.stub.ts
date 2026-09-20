/**
 * Stand-in for the `server-only` package under Vitest.
 *
 * `server-only` exports an empty module under Next's `react-server` resolution
 * condition and throws under every other condition. Vitest resolves the default
 * condition, so importing any module that guards itself with `import 'server-only'`
 * (config, composition, pages) would throw before the test body runs.
 * vitest.config.ts aliases `server-only` to this file, mirroring exactly what
 * Next's own bundler does for server code. Enabling the `react-server` condition
 * instead would also swap react/react-dom for their server builds and break the
 * static-markup tests, hence the alias.
 */
export {};
