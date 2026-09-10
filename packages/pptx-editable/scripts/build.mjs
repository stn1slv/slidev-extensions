// Node runs the sources directly, so there is nothing to compile for use.
//
// What this writes is the walker exactly as Node ships it to the browser:
// `walker.ts` after Node's own type stripping, which is what
// `page.evaluate(collectSnapshot)` serializes at export time. The vendored
// `walker.test.ts` reads it from `dist/pptx-*.mjs` to prove the shipped
// function stays self-contained, the same check upstream runs on its bundle.
import fs from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const source = fs.readFileSync(path.join(root, 'src/pptx/walker.ts'), 'utf8')
fs.mkdirSync(path.join(root, 'dist'), { recursive: true })
// Stripping replaces each annotation with spaces of the same length, so
// `const nodes: RawNode[] = []` comes out as `const nodes            = []`.
// Collapse those runs (indentation untouched) so the tests' text anchors match
// the way they do on a bundler's output. No literal in walker.ts holds two
// consecutive spaces, so this changes nothing the browser sees.
const shipped = stripTypeScriptTypes(source, { mode: 'strip' }).replace(/(\S) {2,}/g, '$1 ')
fs.writeFileSync(path.join(root, 'dist/pptx-walker.mjs'), shipped)
console.log('build: dist/pptx-walker.mjs (walker.ts as Node strips it)')
