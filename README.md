# slidev-extensions

[![CI](https://github.com/stn1slv/slidev-extensions/actions/workflows/ci.yml/badge.svg)](https://github.com/stn1slv/slidev-extensions/actions/workflows/ci.yml)

Tools for [Slidev](https://sli.dev) that live outside the Slidev codebase, one npm package per folder under `packages/`.

| Package | Command | What it does |
|---|---|---|
| [`packages/pptx-editable`](packages/pptx-editable) | `slidev-pptx-editable` | Export a deck as PowerPoint with native shapes and editable text. Standalone build of [slidevjs/slidev#2722](https://github.com/slidevjs/slidev/pull/2722) until it is merged. |

## Installation

Each package runs on macOS, Windows and Linux with Node 22.18 or newer; CI installs the packed tarball into a fresh deck and runs an export on all three. The tool is installed into the deck, next to `slides.md`, so it uses the deck's own Slidev and Playwright.

**From npm**, once a release exists (the `Release` workflow publishes on a `<package>-v<version>` tag):

```bash
npm i -g slidev-export-pptx-editable
cd <deck-folder>
npm i -D playwright-chromium && npx playwright install chromium
slidev-pptx-editable slides.md --output dist/slides.pptx
```

Each GitHub Release also carries the tarball, for machines without registry access: `npm i -g <tarball URL from the release page>`.

**From a checkout**, for development or before the first release:

```bash
git clone https://github.com/stn1slv/slidev-extensions.git
cd slidev-extensions/packages/pptx-editable
npm install                      # also builds dist/
npx playwright install chromium  # once per machine
```

Then, in the deck folder:

```bash
npm i -D playwright-chromium ../path/to/slidev-extensions/packages/pptx-editable
npx slidev-pptx-editable slides.md --output dist/slides.pptx
```

On Windows use PowerShell or `cmd` with the same commands; paths may use either `/` or `\`. `make` is optional: every `Makefile` target has an npm equivalent (`npm run build`, `npm test`, `npm run lint`).

**As a tarball**, for a machine without the checkout: run `npm pack` in `packages/pptx-editable`, copy the `.tgz` to the deck folder, and `npm i -D playwright-chromium ./slidev-export-pptx-editable-<version>.tgz`.

## Releasing

Bump `version` in the package's `package.json`, commit, and push a tag named `<package>-v<version>`, for example `pptx-editable-v0.1.0`. The `Release` workflow checks that the tag and the version agree, runs lint and tests, packs the tarball, installs it globally as a smoke test, publishes to npm with provenance, and creates a GitHub Release with the tarball attached. It needs the repository secret `NPM_TOKEN` (an npm automation token with publish rights). Running the workflow by hand with `dry-run` on does everything except publish.

## Development

Each package has its own `Makefile` with `setup`, `test`, `lint`, `format` and `build`; the root `Makefile` runs the same target in every package. See the package README for how the vendored code is kept in sync with its upstream pull request.
