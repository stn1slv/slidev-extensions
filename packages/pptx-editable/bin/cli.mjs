#!/usr/bin/env node
// `dist` is written by `npm run build` (also on `prepare`). The sources are
// TypeScript, and Node refuses to strip types for files under node_modules,
// so an installed copy of this package has to run the built JavaScript.
await import('../dist/cli.js')
