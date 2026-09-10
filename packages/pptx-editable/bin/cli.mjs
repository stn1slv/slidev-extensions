#!/usr/bin/env node
// The sources are TypeScript. Node runs them directly, and the hook makes
// that work from inside node_modules too (see ts-loader.mjs), so an
// installed copy needs neither a build step nor an install script.
import { register } from 'node:module'

register('./ts-loader.mjs', import.meta.url)
await import('../src/cli.ts')
