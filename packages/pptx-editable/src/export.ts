import type { Page } from 'playwright-chromium'
import type { EditableExportResult } from './pptx/index.ts'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { exportPptxEditable } from './pptx/index.ts'

export interface EditableExportOptions {
  entry: string
  theme?: string
  output?: string
  range?: string
  withClicks: boolean
  dark?: boolean
  timeout: number
  wait: number
  waitUntil?: 'networkidle' | 'load' | 'domcontentloaded'
  executablePath?: string
  /** Device scale factor for the rasterized parts. `slidev export` defaults to 2. */
  scale: number
}

/** CSS pixels. Chromium's compositor limit is on device pixels, so this stays well below it at scale 2. */
const MAX_VIEWPORT_HEIGHT = 16384

const IMPORT_CONDITIONS = new Set(['import', 'node', 'default'])

/**
 * Pick the entry file out of a `package.json` `exports` value the way Node
 * does for `import`: conditions are tried in the order the package wrote them,
 * and the first one this tool understands wins.
 */
function entryFromExports(value: unknown): string | undefined {
  if (typeof value === 'string')
    return value
  if (Array.isArray(value))
    return value.map(entryFromExports).find(Boolean)
  if (value && typeof value === 'object') {
    const map = value as Record<string, unknown>
    if ('.' in map)
      return entryFromExports(map['.'])
    for (const condition of Object.keys(map)) {
      if (IMPORT_CONDITIONS.has(condition))
        return entryFromExports(map[condition])
    }
  }
  return undefined
}

/**
 * Resolve a package from the deck being exported rather than from this tool.
 * A `file:` or global install of this tool has its own `node_modules`, while
 * the `@slidev/cli`, theme and browser the deck actually uses live next to
 * `slides.md`. Slidev itself resolves Playwright the same way.
 */
async function importFromDeck(name: string, deckDir: string): Promise<any> {
  const require = createRequire(path.join(deckDir, 'package.json'))

  // The common case. `require.resolve` follows the `exports` map under the
  // `require` condition, so a dual package yields its CommonJS build; that is
  // fine for Playwright. Only resolution is guarded: a module that fails while
  // loading must surface its own error, not a "not installed" message.
  let resolved: string | undefined
  try {
    resolved = require.resolve(name)
  }
  catch (error: any) {
    if (error?.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED' && error?.code !== 'MODULE_NOT_FOUND')
      throw error
  }
  if (resolved)
    return await import(pathToFileURL(resolved).href)

  // An ESM-only package such as @slidev/cli exposes no `require` condition, so
  // walk up from the deck to its package.json and read the entry ourselves.
  for (let dir = deckDir; ; dir = path.dirname(dir)) {
    const pkgJsonPath = path.join(dir, 'node_modules', name, 'package.json')
    if (fs.existsSync(pkgJsonPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'))
      const entry = entryFromExports(pkg.exports) ?? pkg.main
      if (typeof entry !== 'string')
        throw new Error(`${name} at ${path.dirname(pkgJsonPath)} has no usable entry in its package.json`)
      return await import(pathToFileURL(path.join(path.dirname(pkgJsonPath), entry)).href)
    }
    if (dir === path.dirname(dir))
      break
  }
  throw new Error(`cannot find ${name} from ${deckDir}; install it in the deck with: npm i -D ${name}`)
}

async function importPlaywright(deckDir: string): Promise<any> {
  try {
    return await importFromDeck('playwright-chromium', deckDir)
  }
  catch (first) {
    // Slidev accepts the full `playwright` package too, and many decks have that one.
    try {
      return await importFromDeck('playwright', deckDir)
    }
    catch {
      throw first
    }
  }
}

export async function exportEditable(opts: EditableExportOptions): Promise<EditableExportResult> {
  const deckDir = path.resolve(path.dirname(opts.entry))
  const { resolveOptions, createServer } = await importFromDeck('@slidev/cli', deckDir)
  const playwright = await importPlaywright(deckDir)
  const chromium = playwright.chromium ?? playwright.default?.chromium
  if (!chromium)
    throw new Error('the Playwright package found in the deck exports no `chromium`')

  const options = await resolveOptions({ entry: opts.entry, theme: opts.theme }, 'export')
  const config = options.data.config

  const width: number = config.canvasWidth
  const height = Math.round(width / config.aspectRatio)
  const total: number = options.data.slides.length
  const pages = parseRangeString(total, opts.range)
  if (pages.length === 0)
    throw new Error(`--range "${opts.range}" selects none of the ${total} slides`)

  // The export navigates by URL, which memory routing ignores. The client
  // reads the mode from this config when the server serves it, so switch it
  // here rather than in the URL alone.
  if (config.routerMode === 'memory')
    config.routerMode = 'history'
  const routerMode: string = config.routerMode
  const dark = opts.dark || config.colorSchema === 'dark'
  // Same as `slidev export`, which serves the deck at the root regardless of `base`.
  const base = '/'

  let output = opts.output || config.exportFilename || `${path.basename(opts.entry, '.md')}-export`
  if (!output.endsWith('.pptx'))
    output = `${output}.pptx`
  // The vendored exporter writes with `fs.writeFile` and cannot create `dist/`.
  await fs.promises.mkdir(path.dirname(path.resolve(output)), { recursive: true })

  let server: any
  let browser: any
  let page: Page
  let port = 0
  try {
    server = await createServer(options, { server: { port: 12445, strictPort: false }, clearScreen: false, logLevel: 'error' })
    await server.listen()
    const address = server.httpServer?.address()
    if (!address || typeof address !== 'object')
      throw new Error('Failed to get Vite server port')
    port = address.port

    browser = await chromium.launch({ executablePath: opts.executablePath })
    const context = await browser.newContext({
      viewport: {
        width,
        // Calculate height for every slides to be in the viewport to trigger the rendering of iframes (twitter, youtube...)
        height: height * pages.length,
      },
      deviceScaleFactor: opts.scale,
    })
    page = await context.newPage()

    const result = await exportPptxEditable({ page, slides: options.data.slides, width, height, pages, go }, output)
    if (result.slideCount === 0) {
      // The exporter has already written the file; leave nothing that looks like success.
      await fs.promises.rm(result.output, { force: true })
      throw new Error('the print page rendered no slides, so nothing was exported')
    }
    return result
  }
  finally {
    // Close both even when one of them throws; the process must not keep either alive.
    const closed = await Promise.allSettled([browser?.close(), server?.close()])
    for (const outcome of closed) {
      if (outcome.status === 'rejected')
        console.error(outcome.reason)
    }
  }

  // Copied from `exportSlides` in packages/slidev/node/commands/export.ts and
  // kept whole, per-slide branches included, so it diffs cleanly against
  // upstream. Only `go('print')` is called today.
  async function go(no: number | string, clicks?: string) {
    const query = new URLSearchParams()
    if (opts.withClicks)
      query.set('print', 'clicks')
    else
      query.set('print', 'true')
    if (opts.range)
      query.set('range', opts.range)
    if (clicks)
      query.set('clicks', clicks)

    const url = routerMode === 'hash'
      ? `http://localhost:${port}${base}?${query}#${no}`
      : `http://localhost:${port}${base}${no}?${query}`
    await page.goto(url, {
      waitUntil: opts.waitUntil,
      timeout: opts.timeout,
    })
    if (opts.waitUntil)
      await page.waitForLoadState(opts.waitUntil)
    await page.emulateMedia({ colorScheme: dark ? 'dark' : 'light', media: 'screen' })
    const slide = no === 'print'
      ? page.locator('body')
      : page.locator(`[data-slidev-no="${no}"]`)
    await slide.waitFor()

    // The print page holds one container per click step, and `--range` does not
    // shrink what it renders, so the viewport sized from the page count above
    // can end well before the last container. Grow it to the whole document so
    // lazy content below the fold renders the same way as at the top, once now
    // and once more after the waits below, since loading can add height.
    if (no === 'print')
      await growViewportToDocument()

    // Wait for slides to be loaded
    {
      const elements = slide.locator('.slidev-slide-loading')
      const count = await elements.count()
      for (let index = 0; index < count; index++)
        await elements.nth(index).waitFor({ state: 'detached' })
    }
    // Check for "data-waitfor" attribute and wait for given element to be loaded
    {
      const elements = slide.locator('[data-waitfor]')
      const count = await elements.count()
      for (let index = 0; index < count; index++) {
        const element = elements.nth(index)
        const attribute = await element.getAttribute('data-waitfor')
        if (attribute) {
          await element.locator(attribute).waitFor({ state: 'visible' }).catch((e) => {
            console.error(e)
            process.exitCode = 1
          })
        }
      }
    }
    // Wait for frames to load
    {
      const frames = page.frames()
      await Promise.all(frames.map(frame => frame.waitForLoadState(undefined, { timeout: opts.timeout })))
    }
    // Wait for Mermaid graphs to be rendered
    {
      const container = slide.locator('#mermaid-rendering-container')
      const count = await container.count()
      if (count > 0) {
        while (true) {
          const element = container.locator('div').first()
          if (await element.count() === 0)
            break
          await element.waitFor({ state: 'detached' })
        }
        await container.evaluate(node => node.style.display = 'none')
      }
    }
    // Hide Monaco aria container
    {
      const elements = slide.locator('.monaco-aria-container')
      const count = await elements.count()
      for (let index = 0; index < count; index++) {
        const element = elements.nth(index)
        await element.evaluate(node => node.style.display = 'none')
      }
    }
    // Wait for the given time
    if (opts.wait)
      await page.waitForTimeout(opts.wait)

    if (no === 'print')
      await growViewportToDocument()
  }

  async function growViewportToDocument() {
    const documentHeight: number = await page.evaluate(() => document.documentElement.scrollHeight)
    const viewport = page.viewportSize()
    if (!viewport || documentHeight <= viewport.height)
      return
    // Chromium refuses very tall surfaces, and the device scale factor
    // multiplies the pixels behind them. Beyond the cap the export still
    // works; only lazy content past it may render as it would off-screen.
    const height = Math.min(documentHeight, MAX_VIEWPORT_HEIGHT)
    if (height < documentHeight)
      console.warn(`  print page is ${documentHeight}px tall; viewport capped at ${MAX_VIEWPORT_HEIGHT}px`)
    if (height > viewport.height)
      await page.setViewportSize({ width: viewport.width, height })
  }
}

const RANGE_SEPARATOR = /[,;]/g

/** Same grammar as `slidev export --range`: `1,3-5,8-`. Copied from @slidev/parser `parseRangeString`, plus a lower bound. */
export function parseRangeString(total: number, rangeStr?: string): number[] {
  const range = (from: number, to: number) => Array.from({ length: Math.max(0, to - from) }, (_, i) => from + i)

  if (!rangeStr || rangeStr === 'all' || rangeStr === '*')
    return range(1, total + 1)

  if (rangeStr === 'none')
    return []

  const indexes: number[] = []
  for (const part of rangeStr.split(RANGE_SEPARATOR)) {
    if (!part.includes('-')) {
      indexes.push(+part)
    }
    else {
      const [start, end] = part.split('-', 2)
      indexes.push(
        ...range(+start, !end ? (total + 1) : (+end + 1)),
      )
    }
  }

  return [...new Set(indexes)].filter(i => Number.isInteger(i) && i >= 1 && i <= total).sort((a, b) => a - b)
}
