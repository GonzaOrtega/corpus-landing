// Ambient Bun globals for scripts/stack-conformance/*.ts (vendored verbatim
// from Claude Stack, run via `bun scripts/...`). The app itself targets
// Node.js only (spec §13.3) — this file exists so `tsc --noEmit` can see
// `import.meta.main` etc. without adding Bun globals project-wide via
// tsconfig's `types` array, which would also suppress the default implicit
// inclusion of every other @types/* package.
/// <reference types="bun-types" />
