# slidev-export-pptx-editable

[![CI](https://github.com/stn1slv/slidev-extensions/actions/workflows/ci.yml/badge.svg)](https://github.com/stn1slv/slidev-extensions/actions/workflows/ci.yml)

Export a [Slidev](https://sli.dev) deck as PowerPoint with native shapes and editable text, rather than one picture per slide.

This is a standalone build of [slidevjs/slidev#2722](https://github.com/slidevjs/slidev/pull/2722), which adds `slidev export --format pptx-editable`. Until that pull request is merged and released, this package gives the same result without a fork of Slidev: the exporter under `src/pptx/` is a verbatim copy of the pull request (commit in `UPSTREAM`), and about 150 lines of glue replace the parts of `slidev export` it plugs into. On the same deck the two produce byte-identical `.pptx` files apart from the document timestamps.

## Install

Globally, once, on macOS, Windows or Linux with Node 22.18 or newer:

```bash
npm i -g slidev-export-pptx-editable
```

or as a dev dependency of the deck, next to `slides.md`:

```bash
npm i -D slidev-export-pptx-editable
```

Either way the deck needs a browser for Playwright:

```bash
npm i -D playwright-chromium
npx playwright install chromium   # once per machine
```

Releases are cut by the repository's `Release` workflow on a `pptx-editable-v<version>` tag; each one also attaches the tarball to the GitHub Release for installs without registry access.

The tool resolves `@slidev/cli`, the theme and Playwright from the deck, not from its own folder, so the deck decides which Slidev version renders. If the deck has the full `playwright` package instead of `playwright-chromium`, that is used. Requires Node 22.18 or newer. CI installs the packed tarball into a fresh deck and runs an export on Ubuntu, macOS and Windows with Node 22 and 24.

From a checkout rather than the registry, run `make setup` in `packages/pptx-editable` once (it installs and builds `dist/`), then add the folder as a `file:` dependency of the deck.

## Use

```bash
slidev-pptx-editable slides.md --output dist/slides.pptx   # or npx slidev-pptx-editable ...
```

Options mirror `slidev export`: `--range`, `--with-clicks` (default on; `--no-with-clicks` for one slide per source slide), `--dark`, `--theme`, `--timeout`, `--wait`, `--wait-until`, `--executable-path`, `--scale`. Run with `--help` for the list.

Add it as a script so the deck's `package.json` documents the command:

```json
{
  "scripts": {
    "export:editable": "slidev-pptx-editable slides.md --output dist/slides-editable.pptx"
  }
}
```

## What it does not do

The limits are those of the pull request, quoted from its description:

- No template or `.potx` loading, no slide master synthesis, no font embedding. A `.pptx` names fonts rather than carrying them; the export prints which families it referenced.
- No gradients: `pptxgenjs` has none, so they rasterize.
- `--per-slide` is not offered. The measurement depends on the print page, which per-slide navigation never renders.
- Decorations a theme draws with `::before` or `::after` in normal flow are left out and named at the end of the export. Code block line numbers are the usual case.
- PowerPoint draws a dashed underline as a solid one.
- A long paragraph can wrap onto a different number of lines, because PowerPoint's text metrics are not Chromium's.

A slide that throws, times out, loses all its text, or comes out mostly picture falls back to the image export for that slide alone, and says so.

## Keeping up with the pull request

```bash
make sync    # re-copy src/pptx from $SLIDEV_FORK (default ~/src/github/slidev) and record its commit in UPSTREAM
make test    # the pull request's own tests, run against the copy
make lint    # tsc and eslint
```

`scripts/sync.sh` refuses to run on a dirty fork, makes two mechanical edits to the copy (relative imports gain a `.ts` extension, and one test's path to the shipped walker is shortened by one directory), and fails if any relative import is left without an extension.

`make build` writes `dist/` from `src/` with Node's own type stripping (`module.stripTypeScriptTypes`), not a transpiler, so what ships is what Node would run from the sources. Node refuses to strip types under `node_modules`, which is why an installed copy needs `dist/`. The build also writes `dist/pptx-walker.mjs` so the vendored walker test checks the function that is actually sent to the browser, and it fails if a literal in the sources holds two consecutive spaces, since the emitted code collapses the runs that stripping leaves behind.

## License

MIT. The exporter under `src/pptx/` is from the Slidev repository and carries Slidev's MIT license. The `LICENSE` file ships in the package.
