// Emit dist/ from src/ with Node's own type stripping.
//
// Node runs the sources directly in development, but refuses to strip types
// for anything under node_modules, so an installed copy must run JavaScript.
// Using `stripTypeScriptTypes` rather than tsc keeps the output exactly what
// Node would execute: `page.evaluate(collectSnapshot)` serializes the walker
// function, and a transpiler is free to rewrite that body with helpers that
// do not exist in the browser.
//
// dist/pptx-walker.mjs is a second copy of the walker for the vendored
// `walker.test.ts`, which looks for `pptx-*.mjs` the way upstream's test
// looks for its bundle.
import fs from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const MULTI_SPACE_INSIDE = /\S {2,}\S/
const ANNOTATION_GAP = /(\S) {2,}/g
// `from '…'`, `import('…')` and side-effect `import '…'` forms alike.
const TS_IMPORT = /((?:from\s+|import\(|^\s*import\s+)['"]\.[^'"]*)\.ts(['"])/gm
const RELATIVE_SPECIFIER = /(?:from\s+|import\(|^\s*import\s+)['"](\.[^'"]*)['"]/gm
const TRAILING_COMMENT = /\s\/\/.*$/
const TS_EXT = /\.ts$/

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const src = path.join(root, 'src')
const dist = path.join(root, 'dist')

// Stripping replaces each annotation with spaces of the same length, so
// `const nodes: RawNode[] = []` comes out as `const nodes            = []`.
// In the walker those runs are collapsed so the tests' text anchors match
// the way they do on a bundler's output. That is only safe while no
// literal holds two consecutive spaces, so the source is checked first:
// eslint forbids multiple spaces outside literals and comments, which leaves
// literals as the only place an interior run can come from. Every other
// file is emitted as stripped: the glue's help text aligns columns with
// spaces, and the vendored index.ts indents a report line inside a literal.
function assertNoMultiSpaceLiterals(file, source) {
  source.split('\n').forEach((line, index) => {
    // Comments may align text with spaces; only code and literals are checked.
    const body = line.trimStart().replace(TRAILING_COMMENT, '')
    if (body.startsWith('//') || body.startsWith('*') || body.startsWith('/*'))
      return
    if (MULTI_SPACE_INSIDE.test(body)) {
      throw new Error(`${path.relative(root, file)}:${index + 1}: two consecutive spaces inside a literal; the build's whitespace collapse would change it`)
    }
  })
}

function strip(file, collapse) {
  const source = fs.readFileSync(file, 'utf8')
  let out = stripTypeScriptTypes(source, { mode: 'strip' })
  if (collapse) {
    assertNoMultiSpaceLiterals(file, source)
    out = out.replace(ANNOTATION_GAP, '$1 ')
  }
  // Imports name the .ts sources; the emitted files are .js.
  return out.replace(TS_IMPORT, '$1.js$2')
}

fs.rmSync(dist, { recursive: true, force: true })
let count = 0
for (const file of fs.readdirSync(src, { recursive: true })) {
  // Forward slashes on every platform, so the walker check below matches on Windows too.
  const name = String(file).split(path.sep).join('/')
  if (!name.endsWith('.ts') || name.endsWith('.test.ts'))
    continue
  const out = path.join(dist, name.replace(TS_EXT, '.js'))
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, strip(path.join(src, name), name === 'pptx/walker.ts'))
  count++
}
// Every relative specifier in dist/ must name an emitted file, or the error
// would surface only at runtime on the code path that uses it.
for (const file of fs.readdirSync(dist, { recursive: true })) {
  const name = String(file)
  if (!name.endsWith('.js'))
    continue
  const source = fs.readFileSync(path.join(dist, name), 'utf8')
  for (const [, specifier] of source.matchAll(RELATIVE_SPECIFIER)) {
    const target = path.resolve(path.dirname(path.join(dist, name)), specifier)
    // A directory is not a module under Node ESM, so it must be a file.
    if (!fs.existsSync(target) || !fs.statSync(target).isFile())
      throw new Error(`dist/${name} imports ${specifier}, which was not emitted`)
  }
}
const walker = path.join(dist, 'pptx/walker.js')
if (!fs.existsSync(walker))
  throw new Error(`expected ${walker} for the vendored walker test; was walker.ts renamed upstream?`)
fs.copyFileSync(walker, path.join(dist, 'pptx-walker.mjs'))
console.log(`build: ${count} files to dist/ (types stripped by Node), plus dist/pptx-walker.mjs for the walker test`)
