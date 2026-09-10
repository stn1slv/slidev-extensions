// Module hook that lets Node run this package's TypeScript sources from
// wherever they are installed.
//
// Node strips types from .ts files on its own, but refuses to do so for
// files under a node_modules directory, which is where an installed copy
// lives. This hook does the same stripping in memory with Node's own
// `stripTypeScriptTypes`, so no build step, no install script and no write
// to the install location is needed. Only files under this package's src/
// are handled; everything else goes to the default loader.
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { fileURLToPath } from 'node:url'

const SRC = new URL('../src/', import.meta.url).href

export async function load(url, context, nextLoad) {
  if (url.startsWith(SRC) && url.endsWith('.ts')) {
    const source = await readFile(fileURLToPath(url), 'utf8')
    return { format: 'module', source: stripTypeScriptTypes(source, { mode: 'strip' }), shortCircuit: true }
  }
  return nextLoad(url, context)
}
