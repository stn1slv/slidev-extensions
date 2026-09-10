import process from 'node:process'
import { parseArgs } from 'node:util'
import { dim, green, red } from 'ansis'
import { exportEditable } from './export.ts'
import { reportEditableExport } from './pptx/index.ts'

const HELP = `slidev-pptx-editable [entry] [options]

Export a Slidev deck as PowerPoint with native shapes and editable text.
Standalone build of slidevjs/slidev PR #2722 (\`slidev export --format pptx-editable\`).

Positionals:
  entry                     path to the slides markdown entry      [default: slides.md]

Options:
  -o, --output <file>       output file, .pptx appended when missing
                                    [default: exportFilename from headmatter, else <entry>-export]
      --range <spec>        slides to export, e.g. 1,3-5,8-        [default: all]
      --with-clicks         one slide per click step               [default: true]
      --no-with-clicks      one slide per source slide
      --dark                export as dark theme
  -t, --theme <name>        override theme
      --timeout <ms>        timeout for page rendering             [default: 30000]
      --wait <ms>           extra wait after each page load        [default: 0]
      --wait-until <event>  networkidle | load | domcontentloaded | none
                                                                   [default: networkidle]
      --executable-path <p> browser executable for Playwright
      --scale <n>           device scale factor for rasterized parts  [default: 2]
      --verbose             print the stack trace of a failure
  -h, --help
`

/** A finite number no smaller than `min`, or an error that names the option. */
function numberOption(name: string, raw: string, min: number): number {
  const value = Number(raw)
  if (raw.trim() === '' || !Number.isFinite(value) || value < min)
    throw new Error(`--${name} must be a number of at least ${min}, got: ${raw}`)
  return value
}

async function main() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    allowNegative: true,
    options: {
      'output': { type: 'string', short: 'o' },
      'range': { type: 'string' },
      'with-clicks': { type: 'boolean', default: true },
      'dark': { type: 'boolean', default: false },
      'theme': { type: 'string', short: 't' },
      'timeout': { type: 'string', default: '30000' },
      'wait': { type: 'string', default: '0' },
      'wait-until': { type: 'string', default: 'networkidle' },
      'executable-path': { type: 'string' },
      'scale': { type: 'string', default: '2' },
      'verbose': { type: 'boolean', default: false },
      'help': { type: 'boolean', short: 'h', default: false },
    },
  })

  if (values.help) {
    console.log(HELP)
    return
  }
  if (positionals.length > 1)
    throw new Error(`expected one entry file, got: ${positionals.join(' ')}`)

  const waitUntil = values['wait-until']
  if (!['networkidle', 'load', 'domcontentloaded', 'none'].includes(waitUntil))
    throw new Error(`--wait-until must be networkidle, load, domcontentloaded or none, got: ${waitUntil}`)

  const entry = positionals[0] ?? 'slides.md'
  console.log(dim(`  rendering ${entry} ...`))

  const result = await exportEditable({
    entry,
    theme: values.theme,
    output: values.output,
    range: values.range,
    withClicks: values['with-clicks'],
    dark: values.dark,
    timeout: numberOption('timeout', values.timeout, 0),
    wait: numberOption('wait', values.wait, 0),
    waitUntil: waitUntil === 'none' ? undefined : waitUntil as 'networkidle' | 'load' | 'domcontentloaded',
    executablePath: values['executable-path'],
    scale: numberOption('scale', values.scale, 0.1),
  })

  reportEditableExport(result)
  console.log(`${green('  ✓ ')}${dim('exported to ')}${result.output} ${dim(`(${result.slideCount} slides)`)}\n`)
}

// Set the exit code and let the event loop drain rather than calling
// `process.exit`, which can cut off stdout when it is a pipe or a file.
main().catch((error) => {
  const verbose = process.argv.includes('--verbose')
  console.error(red(`  ✗ ${error instanceof Error ? error.message : String(error)}`))
  if (verbose && error instanceof Error && error.stack)
    console.error(dim(error.stack))
  process.exitCode = 1
})
