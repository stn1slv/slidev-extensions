import type { Page } from 'playwright-chromium'
import type { EditableExportResult } from './pptx/index.ts'
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

/**
 * Resolve a package from the deck being exported rather than from this tool.
 * A `file:` or global install of this tool has its own `node_modules`, while
 * the `@slidev/cli`, theme and browser the deck actually uses live next to
 * `slides.md`. Slidev itself resolves Playwright the same way.
 */
async function importFromDeck(name: string, entry: string): Promise<any> {
  const require = createRequire(path.resolve(path.dirname(entry), 'package.json'))
  const pkgJsonPath = require.resolve(`${name}/package.json`)
  const pkg = require(pkgJsonPath)
  const main = typeof pkg.exports?.['.'] === 'object' ? pkg.exports['.'].import : pkg.main
  return import(pathToFileURL(path.join(path.dirname(pkgJsonPath), main)).href)
}

export async function exportEditable(opts: EditableExportOptions): Promise<EditableExportResult> {
  const { resolveOptions, createServer } = await importFromDeck('@slidev/cli', opts.entry)
  const playwright = await importFromDeck('playwright-chromium', opts.entry)
  const chromium = playwright.chromium ?? playwright.default.chromium

  const options = await resolveOptions({ entry: opts.entry, theme: opts.theme }, 'export')
  const config = options.data.config

  const width: number = config.canvasWidth
  const height = Math.round(width / config.aspectRatio)
  const total: number = options.data.slides.length
  const pages = parseRangeString(total, opts.range)
  // Export navigates by URL; memory routing ignores the URL, so fall back to history.
  const routerMode: string = config.routerMode === 'memory' ? 'history' : config.routerMode
  const dark = opts.dark || config.colorSchema === 'dark'
  const base = '/'

  let output = opts.output || config.exportFilename || `${path.basename(opts.entry, '.md')}-export`
  if (!output.endsWith('.pptx'))
    output = `${output}.pptx`

  const server = await createServer(options, { server: { port: 12445, strictPort: false }, clearScreen: false, logLevel: 'error' })
  await server.listen()
  const address = server.httpServer?.address()
  if (!address || typeof address !== 'object')
    throw new Error('Failed to get Vite server port')
  const port: number = address.port

  const browser = await chromium.launch({ executablePath: opts.executablePath })
  const context = await browser.newContext({
    viewport: {
      width,
      // Calculate height for every slides to be in the viewport to trigger the rendering of iframes (twitter, youtube...)
      height: height * pages.length,
    },
    deviceScaleFactor: opts.scale,
  })
  const page: Page = await context.newPage()

  try {
    return await exportPptxEditable({ page, slides: options.data.slides, width, height, pages, go }, output)
  }
  finally {
    await browser.close()
    await server.close()
  }

  // Copied from `exportSlides` in packages/slidev/node/commands/export.ts.
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
  }
}

const RANGE_SEPARATOR = /[,;]/g

/** Same grammar as `slidev export --range`: `1,3-5,8-`. Copied from @slidev/parser `parseRangeString`. */
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

  return [...new Set(indexes)].filter(i => i <= total).sort((a, b) => a - b)
}
